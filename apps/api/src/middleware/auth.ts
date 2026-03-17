import { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export interface AuthContext {
  userId: string;
  organizationId: string | null;
  role: string;
  email: string;
}

// Throttle lastActiveAt updates: at most once per 5 minutes per user
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;
const lastActiveCache = new Map<string, number>();

// Paths that skip authentication (public routes mounted before this middleware)
const PUBLIC_PREFIXES = ["/api/auth", "/api/provider", "/api/health"];

export const authMiddleware = async (c: Context, next: Next) => {
  const path = c.req.path;
  if (PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return next();
  }

  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const payload = await verify(token, process.env.JWT_SECRET!, "HS256");
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.sub as string),
    });
    if (!user || user.status === "disabled") return c.json({ error: "Unauthorized" }, 401);

    // Throttle lastActiveAt DB writes to once per 5 minutes
    const now = Date.now();
    const lastUpdate = lastActiveCache.get(user.id) || 0;
    if (now - lastUpdate > ACTIVITY_THROTTLE_MS) {
      lastActiveCache.set(user.id, now);
      // Fire-and-forget — don't block the request on a non-critical update
      db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id)).catch((e: any) => console.warn("[auth] lastActiveAt update:", e.message));
    }

    c.set("auth", {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    } as AuthContext);

    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
};
