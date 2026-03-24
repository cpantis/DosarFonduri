import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { preflight, invalidatePreflightCache, type Operation, type PreflightResult } from "../services/dbPreflight";
import path from "path";
import fs from "fs";

export const healthRoutes = new Hono();

// GET /api/health/db — full DB preflight check for all operations
healthRoutes.get("/db", async (c) => {
  const operations: Operation[] = [
    "processGuide",
    "processTemplate",
    "processCompany",
    "solomonChat",
    "neemiaGenerate",
  ];

  const results: Record<string, PreflightResult> = {};
  let allReady = true;

  for (const op of operations) {
    results[op] = await preflight(db, op);
    if (!results[op].ready) allReady = false;
  }

  // Check Redis
  let redisOk = false;
  try {
    const { isRedisReady, redis } = await import("../lib/redis");
    if (isRedisReady()) {
      const pong = await Promise.race([
        redis.ping(),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
      ]);
      redisOk = pong === "PONG";
    }
  } catch { /* redis down */ }

  // Check R2/S3 config (must match storage.ts: S3_ACCESS_KEY + S3_SECRET_KEY + S3_ENDPOINT)
  const r2Ok = !!(process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY && process.env.S3_ENDPOINT);

  const status = allReady && redisOk ? "healthy" : "unhealthy";

  return c.json({
    status,
    database: results,
    redis: redisOk ? "connected" : "disconnected",
    storage: r2Ok ? "configured" : "missing credentials",
    anthropic: process.env.ANTHROPIC_API_KEY ? "configured" : "MISSING",
    timestamp: new Date().toISOString(),
  }, allReady && redisOk ? 200 : 503);
});

// Verify admin secret for dangerous health operations
function requireAdminSecret(c: any): boolean {
  const secret = c.req.query("secret") || c.req.header("x-admin-secret");
  const expected = process.env.ADMIN_SECRET || process.env.JWT_SECRET;
  if (!expected || secret !== expected) return false;
  return true;
}

// POST /api/health/invalidate-cache — force re-check after migration
healthRoutes.post("/invalidate-cache", async (c) => {
  if (!requireAdminSecret(c)) return c.json({ error: "Unauthorized" }, 401);
  invalidatePreflightCache();
  return c.json({ message: "Preflight cache invalidated" });
});

// POST /api/health/run-migrations — execute pending extra migrations
// Reads SQL files from migrations/ and runs any not yet in _extra_migrations
// Query params: ?secret=...&force=FILENAME to re-run a specific migration
healthRoutes.post("/run-migrations", async (c) => {
  if (!requireAdminSecret(c)) return c.json({ error: "Unauthorized" }, 401);
  const forceFile = c.req.query("force"); // re-run a specific migration
  const results: Array<{ file: string; status: string; error?: string }> = [];

  try {
    // Ensure tracking table exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "_extra_migrations" (
        "filename" varchar(255) PRIMARY KEY,
        "applied_at" timestamp DEFAULT now() NOT NULL
      )
    `);

    // Get already-applied migrations
    const applied = await db.execute(sql`SELECT filename FROM "_extra_migrations"`);
    const appliedSet = new Set(
      (applied as unknown as Array<{ filename: string }>).map((r) => r.filename)
    );

    // Determine migrations path
    const migrationsPath = __dirname.includes("dist")
      ? path.join(__dirname, "../../src/db/migrations")
      : path.join(__dirname, "../db/migrations");

    if (!fs.existsSync(migrationsPath)) {
      return c.json({ error: "Migrations folder not found", path: migrationsPath }, 500);
    }

    const extraFiles = fs
      .readdirSync(migrationsPath)
      .filter(
        (f) =>
          f.endsWith(".sql") &&
          !f.startsWith("0000") &&
          !f.startsWith("0001") &&
          !f.startsWith("0002") &&
          !f.startsWith("0003")
      )
      .sort();

    for (const file of extraFiles) {
      if (appliedSet.has(file) && file !== forceFile) {
        results.push({ file, status: "already_applied" });
        continue;
      }

      const sqlContent = fs.readFileSync(path.join(migrationsPath, file), "utf-8");
      // Split into statements handling DO $$ blocks
      const statements = splitSqlStatements(sqlContent);
      let hasError = false;
      const errors: string[] = [];

      for (const stmt of statements) {
        try {
          await db.execute(sql.raw(stmt));
        } catch (e: any) {
          const msg = e.message || "";
          // Safe to ignore: idempotent DDL re-runs
          if (msg.includes("already exists") || msg.includes("duplicate")) {
            continue;
          }
          // Aborted transaction from stale BEGIN — fatal for remaining stmts
          if (msg.includes("current transaction is aborted")) {
            errors.push("Transaction aborted — remaining statements skipped. Re-run migration.");
            hasError = true;
            break;
          }
          errors.push(msg.substring(0, 150));
          hasError = true;
        }
      }

      // Track as applied
      try {
        await db.execute(
          sql`INSERT INTO "_extra_migrations" (filename) VALUES (${file}) ON CONFLICT DO NOTHING`
        );
      } catch { /* ignore */ }

      results.push({
        file,
        status: hasError ? "applied_with_warnings" : "applied",
        ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
      });
    }

    // Invalidate preflight cache so health/db reflects new state
    invalidatePreflightCache();

    return c.json({ message: "Migrations complete", results });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/health/verify — run read-only integrity checks on the database
healthRoutes.get("/verify", async (c) => {
  if (!requireAdminSecret(c)) return c.json({ error: "Unauthorized" }, 401);

  const checks: Array<{ check: string; result: string }> = [];

  const queries: Array<{ name: string; query: string }> = [
    {
      name: "orphan_project_elements",
      query: `SELECT COUNT(*) AS cnt FROM project_elements pe LEFT JOIN projects p ON pe.project_id = p.id WHERE p.id IS NULL`,
    },
    {
      name: "orphan_documents",
      query: `SELECT COUNT(*) AS cnt FROM documents d LEFT JOIN document_folders df ON d.folder_id = df.id WHERE df.id IS NULL`,
    },
    {
      name: "orphan_companies",
      query: `SELECT COUNT(*) AS cnt FROM companies c LEFT JOIN organizations o ON c.organization_id = o.id WHERE o.id IS NULL`,
    },
    {
      name: "orphan_users",
      query: `SELECT COUNT(*) AS cnt FROM users u LEFT JOIN organizations o ON u.organization_id = o.id WHERE u.organization_id IS NOT NULL AND o.id IS NULL`,
    },
    {
      name: "orphan_rules",
      query: `SELECT COUNT(*) AS cnt FROM rules r LEFT JOIN documents d ON r.document_id = d.id WHERE d.id IS NULL`,
    },
    {
      name: "orphan_eligibility",
      query: `SELECT COUNT(*) AS cnt FROM project_eligibility pe LEFT JOIN rules r ON pe.rule_id = r.id WHERE r.id IS NULL`,
    },
    {
      name: "orphan_conversations",
      query: `SELECT COUNT(*) AS cnt FROM solomon_conversations sc LEFT JOIN projects p ON sc.project_id = p.id WHERE p.id IS NULL`,
    },
    {
      name: "orphan_projects_no_company",
      query: `SELECT COUNT(*) AS cnt FROM projects p LEFT JOIN companies c ON p.company_id = c.id WHERE c.id IS NULL`,
    },
    {
      name: "orphan_projects_no_folder",
      query: `SELECT COUNT(*) AS cnt FROM projects p LEFT JOIN document_folders df ON p.folder_id = df.id WHERE df.id IS NULL`,
    },
  ];

  for (const q of queries) {
    try {
      const result = await db.execute(sql.raw(q.query));
      const cnt = Number((result as any)[0]?.cnt ?? 0);
      checks.push({ check: q.name, result: cnt === 0 ? "OK" : `PROBLEM: ${cnt} orphans` });
    } catch (e: any) {
      checks.push({ check: q.name, result: `ERROR: ${e.message?.substring(0, 100)}` });
    }
  }

  // Table existence checks
  const requiredTables = [
    "organizations", "users", "companies", "company_associates", "company_administrators",
    "company_financials", "company_if_members", "document_folders", "documents", "files",
    "rules", "template_elements", "element_definitions", "guide_reference_tables",
    "template_placeholder_mapping", "element_rule_links", "rule_reference_links",
    "projects", "project_elements", "project_eligibility", "project_documents",
    "project_checklist", "solomon_conversations", "solomon_messages", "solomon_knowledge",
    "compose_section_versions", "scoring_criteria", "project_scores",
    "cabinet_codes", "org_config", "api_integrations", "ai_usage_log", "audit_log",
    "element_audit_log", "session_checklist", "password_reset_tokens",
    "company_elements", "custom_labels",
  ];

  const missingTables: string[] = [];
  for (const table of requiredTables) {
    try {
      const result = await db.execute(
        sql.raw(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}'`)
      );
      if ((result as any).length === 0) missingTables.push(table);
    } catch {
      missingTables.push(table + " (error)");
    }
  }

  // FK constraint checks — verify critical constraints exist
  const requiredConstraints = [
    { table: "project_elements", constraint: "project_elements_template_element_id_template_elements_id_fk" },
    { table: "project_elements", constraint: "project_elements_element_def_id_element_definitions_id_fk" },
    { table: "users", constraint: "users_organization_id_organizations_id_fk" },
    { table: "projects", constraint: "projects_organization_id_organizations_id_fk" },
    { table: "companies", constraint: "companies_organization_id_organizations_id_fk" },
  ];

  const missingConstraints: string[] = [];
  for (const fk of requiredConstraints) {
    try {
      const result = await db.execute(
        sql.raw(`SELECT 1 FROM information_schema.table_constraints WHERE table_name = '${fk.table}' AND constraint_name = '${fk.constraint}'`)
      );
      if ((result as any).length === 0) missingConstraints.push(`${fk.table}.${fk.constraint}`);
    } catch {
      missingConstraints.push(`${fk.table}.${fk.constraint} (error)`);
    }
  }

  // Table counts
  let counts: Record<string, number> = {};
  const countTables = ["organizations", "users", "companies", "projects", "documents", "rules",
    "element_definitions", "project_elements", "solomon_conversations", "project_documents"];
  for (const t of countTables) {
    try {
      const result = await db.execute(sql.raw(`SELECT COUNT(*) AS cnt FROM "${t}"`));
      counts[t] = Number((result as any)[0]?.cnt ?? 0);
    } catch { counts[t] = -1; }
  }

  // Check extra migrations tracking
  let appliedMigrations: string[] = [];
  try {
    const result = await db.execute(sql.raw(`SELECT filename FROM "_extra_migrations" ORDER BY filename`));
    appliedMigrations = (result as any).map((r: any) => r.filename);
  } catch {
    appliedMigrations = ["_extra_migrations table does not exist"];
  }

  const hasProblems = checks.some(c => c.result.startsWith("PROBLEM") || c.result.startsWith("ERROR"))
    || missingTables.length > 0
    || missingConstraints.length > 0;

  return c.json({
    status: hasProblems ? "issues_found" : "healthy",
    checks,
    missingTables: missingTables.length > 0 ? missingTables : "none",
    missingConstraints: missingConstraints.length > 0 ? missingConstraints : "none",
    counts,
    appliedMigrations,
    timestamp: new Date().toISOString(),
  });
});

/** Split SQL into executable statements, handling DO $$ blocks.
 *  Strips bare BEGIN/COMMIT/ROLLBACK since we run statements individually
 *  on a connection pool — transaction wrappers don't work across separate
 *  db.execute() calls. */
function splitSqlStatements(content: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarBlock = false;
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inDollarBlock && trimmed.startsWith("--")) continue;

    if (!inDollarBlock && /\$\$/.test(trimmed)) {
      inDollarBlock = true;
      current += line + "\n";
      const matches = trimmed.match(/\$\$/g);
      if (matches && matches.length >= 2) {
        inDollarBlock = false;
        if (trimmed.endsWith(";")) {
          statements.push(current.trim());
          current = "";
        }
      }
      continue;
    }

    if (inDollarBlock) {
      current += line + "\n";
      if (/\$\$\s*;?\s*$/.test(trimmed)) {
        inDollarBlock = false;
        statements.push(current.trim());
        current = "";
      }
      continue;
    }

    current += line + "\n";
    if (trimmed.endsWith(";")) {
      const stmt = current.trim().replace(/-->\s*statement-breakpoint\s*$/, "").trim();
      if (stmt.length > 0) statements.push(stmt);
      current = "";
    }
  }

  const remaining = current.trim();
  if (remaining.length > 0 && remaining !== ";") statements.push(remaining);

  // Strip bare transaction control statements — they break when run
  // individually on a connection pool (BEGIN on conn A, statements on conn B,
  // and if any fail the transaction is aborted on that connection)
  return statements.filter(s => {
    const upper = s.replace(/;$/, "").trim().toUpperCase();
    return upper !== "BEGIN" && upper !== "COMMIT" && upper !== "ROLLBACK";
  });
}
