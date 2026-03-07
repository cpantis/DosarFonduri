import { Context, Next } from "hono";
import { db } from "../db";
import { auditLog } from "../db/schema";
import type { AuthContext } from "./auth";

export const auditMiddleware = async (c: Context, next: Next) => {
  await next();

  // Only log mutating requests
  const method = c.req.method;
  if (method === "GET" || method === "OPTIONS" || method === "HEAD") return;

  const auth = c.get("auth") as AuthContext | undefined;
  if (!auth || !auth.organizationId) return;

  try {
    await db.insert(auditLog).values({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: `${method} ${c.req.path}`,
      details: { status: c.res.status },
    });
  } catch {
    // Don't fail the request if audit logging fails
  }
};
