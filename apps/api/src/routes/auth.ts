import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import { db } from "../db";
import { users, organizations, cabinetCodes } from "../db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { AppEnv } from "../types/hono";

export const authRoutes = new Hono<AppEnv>();

// --- SIGNUP ---
const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  cui: z.string().optional(),
  cabinetCode: z.string().optional(),
});

authRoutes.post("/signup", async (c) => {
  const body = signupSchema.parse(await c.req.json());

  // Check email duplicate
  const existing = await db.query.users.findFirst({ where: eq(users.email, body.email) });
  if (existing && existing.status !== "invited") {
    return c.json({ error: "Email deja inregistrat" }, 400);
  }

  const passwordHash = await bcrypt.hash(body.password, 12);

  // Check if email is pre-registered (invited by admin)
  const preRegistered = await db.query.users.findFirst({
    where: and(eq(users.email, body.email), eq(users.status, "invited")),
  });

  if (preRegistered) {
    await db.update(users).set({
      name: body.name,
      passwordHash,
      status: "active",
    }).where(eq(users.id, preRegistered.id));

    const token = await sign({ sub: preRegistered.id, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }, process.env.JWT_SECRET!, "HS256");
    return c.json({ token, user: { ...preRegistered, name: body.name, status: "active" }, hasOrganization: true });
  }

  if (body.cabinetCode) {
    // Flow: first user activates cabinet
    const code = await db.query.cabinetCodes.findFirst({
      where: eq(cabinetCodes.code, body.cabinetCode.toUpperCase()),
    });
    if (!code || code.organizationId) return c.json({ error: "Cod invalid sau deja folosit" }, 400);
    if (code.expiresAt < new Date()) return c.json({ error: "Cod expirat" }, 400);

    // Create organization
    const [org] = await db.insert(organizations).values({
      name: body.name + " Cabinet",
      code: code.code,
      plan: code.plan,
      maxUsers: code.maxUsers,
      trialEndsAt: new Date(Date.now() + code.trialDays * 86400000),
      status: code.trialDays > 0 ? "trial" : "active",
    }).returning();

    // Create user as admin
    const [user] = await db.insert(users).values({
      email: body.email,
      name: body.name,
      passwordHash,
      organizationId: org.id,
      role: "admin",
      status: "active",
    }).returning();

    // Mark code as used
    await db.update(cabinetCodes).set({
      organizationId: org.id,
      activatedAt: new Date(),
    }).where(eq(cabinetCodes.id, code.id));

    const token = await sign({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }, process.env.JWT_SECRET!, "HS256");
    return c.json({ token, user, organization: org, hasOrganization: true });
  }

  // Flow: signup without code -> pending
  const [user] = await db.insert(users).values({
    email: body.email,
    name: body.name,
    passwordHash,
    status: "pending_cabinet",
  }).returning();

  const token = await sign({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }, process.env.JWT_SECRET!, "HS256");
  return c.json({ token, user, hasOrganization: false });
});

// --- LOGIN ---
authRoutes.post("/login", async (c) => {
  try {
    const { email, password } = await c.req.json();

    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) return c.json({ error: "Email sau parola incorecta" }, 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return c.json({ error: "Email sau parola incorecta" }, 401);

    if (user.status === "disabled") return c.json({ error: "Cont dezactivat" }, 403);

    await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));

    const token = await sign({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }, process.env.JWT_SECRET!, "HS256");
    return c.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, theme: user.theme },
      hasOrganization: !!user.organizationId,
    });
  } catch (err: any) {
    console.error("Login error:", err?.message, err?.stack);
    return c.json({ error: "Eroare la autentificare", detail: err?.message }, 500);
  }
});

// --- ME ---
authRoutes.get("/me", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const payload = await verify(token, process.env.JWT_SECRET!, "HS256");
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.sub as string),
    });
    if (!user) return c.json({ error: "User not found" }, 404);

    let org = null;
    if (user.organizationId) {
      org = await db.query.organizations.findFirst({
        where: eq(organizations.id, user.organizationId),
      });
    }

    return c.json({ user, organization: org });
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});

// --- VALIDATE CODE ---
authRoutes.post("/validate-code", async (c) => {
  const { code } = await c.req.json();

  const cabinetCode = await db.query.cabinetCodes.findFirst({
    where: eq(cabinetCodes.code, code.toUpperCase()),
  });

  if (!cabinetCode || cabinetCode.organizationId) {
    return c.json({ valid: false, error: "Cod invalid sau deja folosit" });
  }
  if (cabinetCode.expiresAt < new Date()) {
    return c.json({ valid: false, error: "Cod expirat" });
  }

  return c.json({
    valid: true,
    plan: cabinetCode.plan,
    maxUsers: cabinetCode.maxUsers,
    trialDays: cabinetCode.trialDays,
  });
});

// --- PREFERENCES ---
authRoutes.patch("/preferences", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const payload = await verify(token, process.env.JWT_SECRET!, "HS256");
    const { theme } = await c.req.json();

    if (theme && (theme === "dark" || theme === "light")) {
      await db.update(users).set({ theme }).where(eq(users.id, payload.sub as string));
    }

    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});
