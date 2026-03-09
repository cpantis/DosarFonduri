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
import { authMiddleware } from "./middleware/auth";
import { auditMiddleware } from "./middleware/audit";
import { errorHandler } from "./middleware/errorHandler";

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
    return c.json({ status: "degraded", db: err?.message, timestamp: new Date().toISOString() }, 503);
  }
});

const port = parseInt(process.env.PORT || "8080");
console.log(`DosarFonduri API running on port ${port}`);
console.log(`  FRONTEND_URL: ${process.env.FRONTEND_URL || "http://localhost:3000"}`);
console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? "✅ set" : "❌ missing"}`);
console.log(`  REDIS_URL: ${process.env.REDIS_URL ? "✅ set" : "⚠️ default"}`);
serve({ fetch: app.fetch, port });
