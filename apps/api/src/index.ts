import "dotenv/config";

// Normalize FRONTEND_URL — ensure it has a protocol prefix so email
// links (href) are valid.  Bare domains like "dosar-fonduri.com" would
// produce broken links in invitation emails.
if (process.env.FRONTEND_URL && !/^https?:\/\//.test(process.env.FRONTEND_URL)) {
  process.env.FRONTEND_URL = `https://${process.env.FRONTEND_URL}`;
}

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { serve } from "@hono/node-server";
import { authRoutes } from "./routes/auth";
import { providerRoutes } from "./routes/provider";
import { companyRoutes } from "./routes/companies";
import { documentRoutes } from "./routes/documents";
import { ruleRoutes } from "./routes/rules";

import { projectRoutes } from "./routes/projects";
import { dashboardRoutes } from "./routes/dashboard";
import { solomonRoutes } from "./routes/solomon";
import { neemiaRoutes } from "./routes/neemia";
import { adminRoutes } from "./routes/admin";
import { configRoutes } from "./routes/config";
import { exportRoutes } from "./routes/export";
import { referenceTableRoutes } from "./routes/reference-tables";
import { healthRoutes } from "./routes/health";
import { formRoutes } from "./routes/forms";
import { authMiddleware } from "./middleware/auth";
import { auditMiddleware } from "./middleware/audit";
import { errorHandler } from "./middleware/errorHandler";
import { rateLimit } from "./middleware/rateLimit";
import { createSSEStream } from "./lib/sse";

// ─── Startup checks ─────────────────────────────────────
const requiredEnv = ["DATABASE_URL", "JWT_SECRET", "PROVIDER_JWT_SECRET"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`❌ Missing required env vars: ${missingEnv.join(", ")}`);
  console.error("Set these in Railway Dashboard → Service → Variables");
  process.exit(1);
}

if (!process.env.REDIS_URL) {
  console.warn("⚠️  REDIS_URL not set — using redis://localhost:6379");
}

const app = new Hono();

// Health check FIRST — must respond before any middleware or route import fails.
// Railway starts healthchecking immediately after the container starts.
app.get("/", (c) => c.json({ status: "ok", service: "dosarfonduri-api" }));
app.get("/health", async (c) => {
  let redisOk = false;
  try {
    const { isRedisReady, redis } = await import("./lib/redis");
    if (isRedisReady()) {
      // Only ping if already connected — avoids hanging when Redis is unreachable
      const pong = await Promise.race([
        redis.ping(),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
      ]);
      redisOk = pong === "PONG";
    }
  } catch { /* redis down or timeout */ }
  return c.json({ status: "ok", service: "dosarfonduri-api", redis: redisOk ? "ok" : "down", timestamp: new Date().toISOString() });
});

// Global middleware
app.use("*", logger());
app.use("*", cors({
  origin: (() => {
    const raw = process.env.FRONTEND_URL || "http://localhost:3000";
    // Support comma-separated origins (e.g. "https://app.dosarfonduri.ro,http://localhost:3000")
    const origins = raw.split(",").map((u) => {
      const trimmed = u.trim();
      return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    });
    return origins.length === 1 ? origins[0] : origins;
  })(),
  credentials: true,
}));

// Rate limiting on public auth routes (brute-force protection)
app.use("/api/auth/*", rateLimit({ windowMs: 60_000, max: 20, keyPrefix: "rl:auth" }));
app.use("/api/provider/*", rateLimit({ windowMs: 60_000, max: 15, keyPrefix: "rl:provider" }));
// Rate limiting on AI-heavy endpoints (cost protection)
app.use("/api/solomon/*", rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "rl:solomon" }));
app.use("/api/neemia/*", rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "rl:neemia" }));
app.use("/api/projects/*/check-eligibility", rateLimit({ windowMs: 60_000, max: 5, keyPrefix: "rl:eligibility" }));

// Public routes
app.route("/api/auth", authRoutes);
app.route("/api/provider", providerRoutes);
app.route("/api/health", healthRoutes);

// Protected routes
app.use("/api/*", authMiddleware);
app.use("/api/*", auditMiddleware);

// Allow large file uploads (50 MB default, 100 MB for document routes)
app.use("/api/documents/*", bodyLimit({ maxSize: 100 * 1024 * 1024 }));
app.use("/api/config/knowledge/upload", bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/companies/*/upload-*", bodyLimit({ maxSize: 20 * 1024 * 1024 }));

app.route("/api/companies", companyRoutes);
app.route("/api/documents", documentRoutes);
app.route("/api/rules", ruleRoutes);

app.route("/api/projects", projectRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/solomon", solomonRoutes);
app.route("/api/neemia", neemiaRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/config", configRoutes);
app.route("/api/export", exportRoutes);
app.route("/api/reference", referenceTableRoutes);
app.route("/api/forms", formRoutes);

// SSE event stream endpoint
app.get("/api/events", async (c) => {
  const auth = (c as any).get("auth");
  if (!auth?.organizationId) return c.json({ error: "Unauthorized" }, 401);

  const projectId = c.req.query("projectId");
  const channels: string[] = [
    `org:${auth.organizationId}:uploads`,
    `org:${auth.organizationId}:jobs`,
  ];
  if (projectId) {
    channels.push(`project:${projectId}:updates`);
  }

  const stream = createSSEStream(channels);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

// Global error handler
app.onError(errorHandler);

// Temporary setup endpoint — triggers migrations + seed via HTTP
app.get("/setup-db", async (c) => {
  const secret = c.req.query("key");
  if (!process.env.SETUP_DB_SECRET) return c.json({ error: "SETUP_DB_SECRET env var not set" }, 500);
  if (secret !== process.env.SETUP_DB_SECRET) return c.json({ error: "Forbidden" }, 403);

  try {
    const { db } = await import("./db");
    const { sql: sqlTag } = await import("drizzle-orm");
    const fs = await import("fs");
    const pathMod = await import("path");
    const bcrypt = await import("bcryptjs");

    // Find migrations directory
    const possiblePaths = [
      pathMod.default.join(__dirname, "../src/db/migrations"),
      pathMod.default.join(__dirname, "../../src/db/migrations"),
      pathMod.default.join(process.cwd(), "src/db/migrations"),
    ];

    let migrationsDir = "";
    for (const p of possiblePaths) {
      const candidate = pathMod.default.join(p, "0000_powerful_dark_beast.sql");
      if (fs.default.existsSync(candidate)) {
        migrationsDir = p;
        break;
      }
    }

    if (!migrationsDir) {
      return c.json({ error: "Migration SQL not found", searched: possiblePaths }, 404);
    }

    // Run ALL migration SQL files in order
    const migrationFiles = fs.default.readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();

    const results: string[] = [];

    for (const file of migrationFiles) {
      const sqlContent = fs.default.readFileSync(pathMod.default.join(migrationsDir, file), "utf-8");
      const statements = sqlContent
        .split(/;\s*$/m)
        .map((s: string) => s.replace(/^[\s]*--[^\n]*\n/gm, "").trim())
        .filter((s: string) => s.length > 0);

      for (const stmt of statements) {
        try {
          await db.execute(sqlTag.raw(stmt));
          results.push(`${file}: OK`);
        } catch (e: any) {
          if (!e.message?.includes("already exists") && !e.message?.includes("duplicate")) {
            results.push(`${file}: ${e.message?.substring(0, 80) || "error"}`);
          }
        }
      }
    }

    // Seed users from env vars — no hardcoded credentials
    const seedEmail = process.env.SEED_DEMO_EMAIL;
    const seedPassword = process.env.SEED_DEMO_PASSWORD;
    const seedName = process.env.SEED_DEMO_USER_NAME || "Admin";
    const seedOrgName = process.env.SEED_DEMO_ORG_NAME || "Default Cabinet";
    let userResult = null;
    let orgResult = null;

    if (seedEmail && seedPassword) {
      const { organizations, users } = await import("./db/schema");
      const [org] = await db.insert(organizations).values({
        name: seedOrgName,
        code: "SETUP-" + Date.now().toString(36).toUpperCase(),
        plan: "professional",
        maxUsers: 5,
        status: "active",
      }).returning();

      const passwordHash = await bcrypt.hash(seedPassword, 12);
      const [user] = await db.insert(users).values({
        email: seedEmail,
        name: seedName,
        passwordHash,
        organizationId: org.id,
        role: "admin",
        status: "active",
      }).returning();
      userResult = { id: user.id, email: user.email };
      orgResult = { id: org.id, name: org.name };
    }

    const providerEmail = process.env.SEED_PROVIDER_EMAIL;
    const providerPassword = process.env.SEED_PROVIDER_PASSWORD;
    if (providerEmail && providerPassword) {
      const { providerUsers } = await import("./db/schema");
      const providerHash = await bcrypt.hash(providerPassword, 12);
      await db.insert(providerUsers).values({
        email: providerEmail,
        name: process.env.SEED_PROVIDER_NAME || "Provider Admin",
        passwordHash: providerHash,
      });
    }

    // Invalidate preflight cache after migrations
    const { invalidatePreflightCache } = await import("./services/dbPreflight");
    invalidatePreflightCache();

    return c.json({
      status: "success",
      migrationsDir,
      migrationsExecuted: migrationFiles.length,
      user: userResult,
      org: orgResult,
    });
  } catch (err: any) {
    return c.json({ error: err.message, stack: err.stack?.substring(0, 500) }, 500);
  }
});

const port = parseInt(process.env.PORT || "8080");
console.log(`DosarFonduri API running on port ${port}`);
console.log(`  FRONTEND_URL: ${process.env.FRONTEND_URL || "http://localhost:3000"}`);
console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? "✅ set" : "❌ missing"}`);
console.log(`  REDIS_URL: ${process.env.REDIS_URL ? "✅ set" : "⚠️ default"}`);

// Run schema safety checks in background (non-blocking)
// This ensures columns added by recent migrations exist even if migrate.ts failed
(async () => {
  try {
    const { db: database } = await import("./db");
    const { sql: sqlTag } = await import("drizzle-orm");
    const stmts = [
      `DO $$ BEGIN CREATE TYPE "generation_mode" AS ENUM('fill','compose'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE TYPE "generation_context" AS ENUM('work','submission'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `DO $$ BEGIN CREATE TYPE "document_type_class" AS ENUM('guide','guide_annex_table','guide_annex_form','certificat_constatator','bilant_anaf','contract_arenda','oferta_pret','registru_imobilizari','declaratie_expert_contabil','document_mediu','extras_cont','certificat_fiscal','memoriu_template','cerere_finantare_template','anexa_b_template','anexa_c_template','carte_identitate','diploma_studii','act_constitutiv','statut','descriere_proiect','adeverinta','foto_echipament','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "mime_type" varchar(100) NOT NULL DEFAULT 'application/octet-stream'`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_hash" varchar(64)`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "generation_mode" "generation_mode" DEFAULT 'fill'`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "compose_config" jsonb`,
      `ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "generation_mode" "generation_mode" DEFAULT 'fill'`,
      `ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "compose_content" jsonb`,
      `ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "generation_context" "generation_context" DEFAULT 'work'`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "document_type_class" "document_type_class"`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "classification_confidence" decimal(3,2)`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "processing_result" jsonb`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "processing_error" text`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "trust_score" decimal(3,2)`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "completeness_report" jsonb`,
      `ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "size" bigint NOT NULL DEFAULT 0`,
      // 0020: upgrade files.size from integer to bigint (supports >2GB files)
      `ALTER TABLE "files" ALTER COLUMN "size" SET DATA TYPE bigint`,
      `ALTER TYPE "doc_processing_type" ADD VALUE IF NOT EXISTS 'reference_data'`,
      // 0019: solomon_knowledge nullable org + compose_section_versions
      `ALTER TABLE "solomon_knowledge" ALTER COLUMN "organization_id" DROP NOT NULL`,
      `CREATE TABLE IF NOT EXISTS "compose_section_versions" (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_document_id UUID NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE, section_marker VARCHAR(255) NOT NULL, version INTEGER NOT NULL DEFAULT 1, content TEXT NOT NULL, source VARCHAR(50) NOT NULL, edited_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      // 0115: password reset tokens
      `CREATE TABLE IF NOT EXISTS "password_reset_tokens" (id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash VARCHAR(64) NOT NULL, expires_at TIMESTAMP NOT NULL, used_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW() NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "prt_token_hash_idx" ON "password_reset_tokens" ("token_hash")`,
    ];
    for (const stmt of stmts) {
      try { await database.execute(sqlTag.raw(stmt)); } catch { /* ignore individual failures */ }
    }
    console.log("[startup] Schema safety check complete");
  } catch (e) {
    console.warn("[startup] Schema safety check failed (non-fatal):", (e as Error).message?.substring(0, 100));
  }
})();

serve({ fetch: app.fetch, port });
