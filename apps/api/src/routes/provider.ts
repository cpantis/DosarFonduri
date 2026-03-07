import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import { db } from "../db";
import { providerUsers, cabinetCodes, organizations } from "../db/schema";
import { eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const providerRoutes = new Hono();

// Provider auth middleware
const providerAuth = async (c: any, next: any) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  try {
    const payload = await verify(token, process.env.PROVIDER_JWT_SECRET!);
    c.set("providerId", payload.sub);
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
};

// Login
providerRoutes.post("/auth/login", async (c) => {
  const { email, password } = await c.req.json();
  const user = await db.query.providerUsers.findFirst({ where: eq(providerUsers.email, email) });
  if (!user) return c.json({ error: "Invalid credentials" }, 401);
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return c.json({ error: "Invalid credentials" }, 401);
  const token = await sign({ sub: user.id }, process.env.PROVIDER_JWT_SECRET!);
  return c.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

// List cabinets
providerRoutes.get("/cabinets", providerAuth, async (c) => {
  const cabinets = await db
    .select()
    .from(organizations)
    .orderBy(organizations.createdAt);
  return c.json(cabinets);
});

// Generate code
providerRoutes.post("/codes", providerAuth, async (c) => {
  const body = z.object({
    plan: z.enum(["starter", "professional", "enterprise"]),
    maxUsers: z.number().min(1).max(100),
    trialDays: z.number().min(0).max(90),
  }).parse(await c.req.json());

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const rand = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const code = `DF-${rand}-${new Date().getFullYear()}`;

  const [created] = await db.insert(cabinetCodes).values({
    code,
    plan: body.plan,
    maxUsers: body.maxUsers,
    trialDays: body.trialDays,
    expiresAt: new Date(Date.now() + 90 * 86400000),
    createdBy: c.get("providerId"),
  }).returning();

  return c.json(created);
});

// List unused codes
providerRoutes.get("/codes/unused", providerAuth, async (c) => {
  const codes = await db.query.cabinetCodes.findMany({
    where: isNull(cabinetCodes.organizationId),
  });
  return c.json(codes);
});

// Delete code
providerRoutes.delete("/codes/:id", providerAuth, async (c) => {
  const id = c.req.param("id");
  await db.delete(cabinetCodes).where(eq(cabinetCodes.id, id));
  return c.json({ ok: true });
});

// Revenue stats
providerRoutes.get("/revenue", providerAuth, async (c) => {
  const planPrices = { starter: 49, professional: 149, enterprise: 399 };
  const orgs = await db.query.organizations.findMany();

  const mrr = orgs
    .filter(o => o.status === "active")
    .reduce((sum, o) => sum + (planPrices[o.plan as keyof typeof planPrices] || 0), 0);

  return c.json({
    totalCabinets: orgs.length,
    activeCabinets: orgs.filter(o => o.status === "active").length,
    trialCabinets: orgs.filter(o => o.status === "trial").length,
    mrr,
  });
});
