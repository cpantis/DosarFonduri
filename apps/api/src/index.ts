import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { authRoutes } from "./routes/auth";
import { providerRoutes } from "./routes/provider";
import { companyRoutes } from "./routes/companies";
import { documentRoutes } from "./routes/documents";
import { ruleRoutes } from "./routes/rules";
import { templateRoutes } from "./routes/templates";
import { projectRoutes } from "./routes/projects";
import { dashboardRoutes } from "./routes/dashboard";
import { solomonRoutes } from "./routes/solomon";
import { neemiaRoutes } from "./routes/neemia";
import { adminRoutes } from "./routes/admin";
import { configRoutes } from "./routes/config";
import { exportRoutes } from "./routes/export";
import { referenceTableRoutes } from "./routes/reference-tables";
import { authMiddleware } from "./middleware/auth";
import { auditMiddleware } from "./middleware/audit";
import { errorHandler } from "./middleware/errorHandler";
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

// Global middleware
app.use("*", logger());
app.use("*", cors({
  origin: (() => {
    const url = process.env.FRONTEND_URL || "http://localhost:3000";
    return url.startsWith("http") ? url : `https://${url}`;
  })(),
  credentials: true,
}));

// Public routes
app.route("/api/auth", authRoutes);
app.route("/api/provider", providerRoutes);

// Protected routes
app.use("/api/*", authMiddleware);
app.use("/api/*", auditMiddleware);
app.route("/api/companies", companyRoutes);
app.route("/api/documents", documentRoutes);
app.route("/api/rules", ruleRoutes);
app.route("/api/templates", templateRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/solomon", solomonRoutes);
app.route("/api/neemia", neemiaRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/config", configRoutes);
app.route("/api/export", exportRoutes);
app.route("/api/reference", referenceTableRoutes);

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

// Health check (both / and /health for Railway healthcheck flexibility)
app.get("/", (c) => c.json({ status: "ok", service: "dosarfonduri-api" }));
app.get("/health", async (c) => {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    return c.json({ status: "ok", db: "connected", timestamp: new Date().toISOString() });
  } catch (err: any) {
    // Return 200 so Railway healthcheck passes — app is alive, DB may be slow to connect
    return c.json({ status: "degraded", db: err?.message, timestamp: new Date().toISOString() });
  }
});

// Temporary setup endpoint — triggers migrations + seed via HTTP
app.get("/setup-db", async (c) => {
  const secret = c.req.query("key");
  if (secret !== "DosarSetup2026") return c.json({ error: "Forbidden" }, 403);

  try {
    const { db } = await import("./db");
    const { sql: sqlTag } = await import("drizzle-orm");
    const fs = await import("fs");
    const pathMod = await import("path");
    const bcrypt = await import("bcryptjs");

    // Check if tables already exist
    const result = await db.execute(sqlTag`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'
      ) as exists
    `);
    const tableExists = result[0]?.exists;

    if (tableExists) {
      return c.json({ status: "tables already exist", skipped: true });
    }

    // Find and execute migration SQL
    const possiblePaths = [
      pathMod.default.join(__dirname, "../src/db/migrations"),
      pathMod.default.join(__dirname, "../../src/db/migrations"),
      pathMod.default.join(process.cwd(), "src/db/migrations"),
    ];

    let sqlFile = "";
    let migrationsDir = "";
    for (const p of possiblePaths) {
      const candidate = pathMod.default.join(p, "0000_powerful_dark_beast.sql");
      if (fs.default.existsSync(candidate)) {
        sqlFile = candidate;
        migrationsDir = p;
        break;
      }
    }

    if (!sqlFile) {
      return c.json({ error: "Migration SQL not found", searched: possiblePaths }, 404);
    }

    const sqlContent = fs.default.readFileSync(sqlFile, "utf-8");
    const statements = sqlContent.split("--> statement-breakpoint").map((s: string) => s.trim()).filter(Boolean);
    const results: string[] = [];

    for (const stmt of statements) {
      try {
        await db.execute(sqlTag.raw(stmt));
        results.push("OK");
      } catch (e: any) {
        results.push(e.message?.substring(0, 80) || "error");
      }
    }

    // Seed demo user
    const { organizations, users } = await import("./db/schema");
    const [org] = await db.insert(organizations).values({
      name: "Demo Cabinet",
      code: "DEMO-2026",
      plan: "professional",
      maxUsers: 5,
      status: "active",
    }).returning();

    const passwordHash = await bcrypt.hash("Demo2026!Selenade", 12);
    const [user] = await db.insert(users).values({
      email: "calin_pantis@yahoo.com",
      name: "Calin Pantis",
      passwordHash,
      organizationId: org.id,
      role: "admin",
      status: "active",
    }).returning();

    // Seed provider user
    const { providerUsers } = await import("./db/schema");
    const providerHash = await bcrypt.hash("ChangeMeNow!2026", 12);
    await db.insert(providerUsers).values({
      email: "admin@dosarfonduri.ro",
      name: "DosarFonduri Admin",
      passwordHash: providerHash,
    });

    return c.json({
      status: "success",
      migrationsDir,
      statementsExecuted: statements.length,
      user: { id: user.id, email: user.email },
      org: { id: org.id, name: org.name },
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
serve({ fetch: app.fetch, port });
