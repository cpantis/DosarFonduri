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

export const authMiddleware = async (c: Context, next: Next) => {
  // Skip auth for public routes already handled before this middleware
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const payload = await verify(token, process.env.JWT_SECRET!);
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.sub as string),
    });
    if (!user || user.status === "disabled") return c.json({ error: "Unauthorized" }, 401);

    // Update last active
    await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));

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
