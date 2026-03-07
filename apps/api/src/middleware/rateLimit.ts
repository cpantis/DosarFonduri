import { Context, Next } from "hono";
import { redis } from "../lib/redis";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, keyPrefix = "rl" } = options;

  return async (c: Context, next: Next) => {
    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
    const key = `${keyPrefix}:${ip}:${c.req.path}`;

    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.pexpire(key, windowMs);
      }

      if (current > max) {
        return c.json({ error: "Too many requests" }, 429);
      }
    } catch {
      // If Redis is down, allow the request
    }

    await next();
  };
}
