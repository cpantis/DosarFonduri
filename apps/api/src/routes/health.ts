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

  // Check R2/S3 config
  const r2Ok = !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID);

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

// POST /api/health/invalidate-cache — force re-check after migration
healthRoutes.post("/invalidate-cache", async (c) => {
  invalidatePreflightCache();
  return c.json({ message: "Preflight cache invalidated" });
});

// POST /api/health/run-migrations — execute pending extra migrations
// Reads SQL files from migrations/ and runs any not yet in _extra_migrations
healthRoutes.post("/run-migrations", async (c) => {
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
      if (appliedSet.has(file)) {
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
          if (msg.includes("already exists") || msg.includes("duplicate")) {
            continue;
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

/** Split SQL into executable statements, handling DO $$ blocks */
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
  return statements;
}
