import { Hono } from "hono";
import { db } from "../db";
import { preflight, invalidatePreflightCache, type Operation, type PreflightResult } from "../services/dbPreflight";

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
