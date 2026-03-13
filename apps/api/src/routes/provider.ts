import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import { db } from "../db";
import { providerUsers, cabinetCodes, organizations, users } from "../db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { lookupCUI_ListaFirme, searchCompany_ListaFirme } from "../services/listafirme";
import type { AppEnv } from "../types/hono";

export const providerRoutes = new Hono<AppEnv>();

// Provider auth middleware
const providerAuth = async (c: any, next: any) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  try {
    const payload = await verify(token, process.env.PROVIDER_JWT_SECRET!, "HS256");
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
  const token = await sign({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }, process.env.PROVIDER_JWT_SECRET!, "HS256");
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

// Generate code — optionally tied to a specific CUI (handshake)
providerRoutes.post("/codes", providerAuth, async (c) => {
  const raw = await c.req.json();

  const body = z.object({
    plan: z.enum(["starter", "professional", "enterprise"]),
    maxUsers: z.coerce.number().min(1).max(100),
    trialDays: z.coerce.number().min(0).max(90),
    cui: z.union([z.string(), z.number()]).transform(v => v != null ? String(v) : undefined).optional().nullable(),
    companyName: z.string().max(500).optional().nullable(),
  }).parse(raw);

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const rand = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const code = `DF-${rand}-${new Date().getFullYear()}`;

  const cuiClean = body.cui?.replace(/\D/g, "") || null;
  const companyName = body.companyName || null;

  // Try insert with CUI columns first; if columns don't exist yet, retry without them
  try {
    const [created] = await db.insert(cabinetCodes).values({
      code,
      plan: body.plan,
      maxUsers: body.maxUsers,
      trialDays: body.trialDays,
      cui: cuiClean,
      companyName,
      isActive: true,
      createdBy: c.get("providerId"),
    }).returning();
    return c.json(created);
  } catch (insertErr: any) {
    // If the error is about missing columns, auto-add them and retry
    if (insertErr.message?.includes("cui") || insertErr.message?.includes("company_name") || insertErr.message?.includes("is_active") || insertErr.message?.includes("column")) {
      console.log("[POST /codes] Missing columns detected, running ALTER TABLE...");
      try {
        await db.execute(sql`ALTER TABLE "cabinet_codes" ADD COLUMN IF NOT EXISTS "cui" varchar(20)`);
        await db.execute(sql`ALTER TABLE "cabinet_codes" ADD COLUMN IF NOT EXISTS "company_name" varchar(500)`);
        await db.execute(sql`ALTER TABLE "cabinet_codes" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true`);
        // Drop expires_at if it exists (migrating from old schema)
        await db.execute(sql`ALTER TABLE "cabinet_codes" DROP COLUMN IF EXISTS "expires_at"`);
        console.log("[POST /codes] Columns migrated successfully, retrying insert...");
      } catch (alterErr: any) {
        console.warn("[POST /codes] ALTER TABLE warning:", alterErr.message);
      }
      // Retry the insert
      const [created] = await db.insert(cabinetCodes).values({
        code,
        plan: body.plan,
        maxUsers: body.maxUsers,
        trialDays: body.trialDays,
        cui: cuiClean,
        companyName,
        isActive: true,
        createdBy: c.get("providerId"),
      }).returning();
      return c.json(created);
    }
    throw insertErr;
  }
});

// List unused codes
providerRoutes.get("/codes/unused", providerAuth, async (c) => {
  try {
    const codes = await db.query.cabinetCodes.findMany({
      where: isNull(cabinetCodes.organizationId),
    });
    return c.json(codes);
  } catch (err: any) {
    // Auto-migrate: add is_active column if missing
    if (err.message?.includes("is_active") || err.message?.includes("column")) {
      await db.execute(sql`ALTER TABLE "cabinet_codes" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true`);
      const codes = await db.query.cabinetCodes.findMany({
        where: isNull(cabinetCodes.organizationId),
      });
      return c.json(codes);
    }
    throw err;
  }
});

// Delete code
providerRoutes.delete("/codes/:id", providerAuth, async (c) => {
  const id = c.req.param("id");
  await db.delete(cabinetCodes).where(eq(cabinetCodes.id, id));
  return c.json({ ok: true });
});

// ─── LISTAFIRME.RO — Lookup CUI ─────────────────────────
// Provider poate interoga orice CUI fără a fi legat de un cabinet
providerRoutes.get("/lookup-cui/:cui", providerAuth, async (c) => {
  const cui = c.req.param("cui");
  try {
    const result = await lookupCUI_ListaFirme(cui);
    if (!result) {
      return c.json({ error: "CUI negăsit", cui }, 404);
    }
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── LISTAFIRME.RO — Căutare firmă după nume ────────────
providerRoutes.get("/search-company", providerAuth, async (c) => {
  const query = c.req.query("q");
  if (!query || query.length < 2) {
    return c.json({ error: "Parametrul q trebuie să aibă minim 2 caractere" }, 400);
  }
  try {
    const results = await searchCompany_ListaFirme(query);
    return c.json({ results });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── EDIT CABINET PLAN ─────────────────────────
providerRoutes.put("/cabinets/:id", providerAuth, async (c) => {
  const id = c.req.param("id");
  const body = z.object({
    plan: z.enum(["starter", "professional", "enterprise"]).optional(),
    maxUsers: z.number().min(1).max(100).optional(),
    status: z.enum(["active", "trial", "inactive", "expired"]).optional(),
  }).parse(await c.req.json());

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });
  if (!org) return c.json({ error: "Cabinet negăsit" }, 404);

  const updates: Record<string, any> = {};
  if (body.plan) updates.plan = body.plan;
  if (body.maxUsers) updates.maxUsers = body.maxUsers;
  if (body.status) updates.status = body.status;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "Nimic de actualizat" }, 400);
  }

  const [updated] = await db
    .update(organizations)
    .set(updates)
    .where(eq(organizations.id, id))
    .returning();

  return c.json(updated);
});

// ─── DEACTIVATE CABINET ─────────────────────────
providerRoutes.post("/cabinets/:id/deactivate", providerAuth, async (c) => {
  const id = c.req.param("id");
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });
  if (!org) return c.json({ error: "Cabinet negăsit" }, 404);

  const [updated] = await db
    .update(organizations)
    .set({ status: "inactive" })
    .where(eq(organizations.id, id))
    .returning();

  return c.json(updated);
});

// ─── SEND EMAIL TO CABINET ─────────────────────────
providerRoutes.post("/cabinets/:id/email", providerAuth, async (c) => {
  const id = c.req.param("id");
  const { subject, message } = z.object({
    subject: z.string().min(1).max(200),
    message: z.string().min(1).max(5000),
  }).parse(await c.req.json());

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, id),
  });
  if (!org) return c.json({ error: "Cabinet negăsit" }, 404);

  // Find all users in this organization
  const orgUsers = await db.query.users.findMany({
    where: eq(users.organizationId, id),
  });

  if (orgUsers.length === 0) {
    return c.json({ error: "Cabinetul nu are utilizatori" }, 400);
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "notificari@dosarfonduri.ro";

  if (!apiKey) {
    return c.json({ error: "RESEND_API_KEY nu este configurat" }, 500);
  }

  let sent = 0;
  for (const user of orgUsers) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `DosarFonduri Provider <${from}>`,
          to: user.email,
          subject,
          html: `<h2>${subject}</h2><p>${message.replace(/\n/g, "<br/>")}</p><hr/><p style="color:#888;font-size:12px">Trimis de Provider DosarFonduri către ${org.name}</p>`,
        }),
      });
      sent++;
    } catch {
      // continue sending to other users
    }
  }

  return c.json({ sent, total: orgUsers.length });
});

// ─── TOGGLE CODE ACTIVE/INACTIVE ─────────────────────────
providerRoutes.post("/codes/:id/toggle", providerAuth, async (c) => {
  const id = c.req.param("id");
  const code = await db.query.cabinetCodes.findFirst({
    where: eq(cabinetCodes.id, id),
  });
  if (!code) return c.json({ error: "Cod negăsit" }, 404);
  if (code.organizationId) return c.json({ error: "Codul este deja activat de un cabinet" }, 400);

  const [updated] = await db
    .update(cabinetCodes)
    .set({ isActive: !code.isActive })
    .where(eq(cabinetCodes.id, id))
    .returning();

  return c.json(updated);
});

// ─── LIST ALL PLATFORM USERS ─────────────────────────
providerRoutes.get("/users", providerAuth, async (c) => {
  const allUsers = await db.query.users.findMany({
    orderBy: (u, { desc }) => [desc(u.createdAt)],
  });

  // Batch-load organizations for all users
  const orgIds = [...new Set(allUsers.filter(u => u.organizationId).map(u => u.organizationId!))];
  const orgs = orgIds.length > 0
    ? await db.query.organizations.findMany()
    : [];
  const orgMap = new Map(orgs.map(o => [o.id, o]));

  return c.json(allUsers.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    lastActiveAt: u.lastActiveAt,
    organizationId: u.organizationId,
    cabinetName: u.organizationId ? orgMap.get(u.organizationId)?.name || null : null,
    cabinetCode: u.organizationId ? orgMap.get(u.organizationId)?.code || null : null,
    cabinetPlan: u.organizationId ? orgMap.get(u.organizationId)?.plan || null : null,
  })));
});

// ─── DELETE USER ─────────────────────────
providerRoutes.delete("/users/:id", providerAuth, async (c) => {
  const id = c.req.param("id");
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) return c.json({ error: "Utilizator negăsit" }, 404);

  await db.delete(users).where(eq(users.id, id));
  return c.json({ ok: true, deletedEmail: user.email });
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

// ─── ACCESS CABINET — Provider enters a cabinet as admin ─────
// Generates a user-level JWT for the first admin of the cabinet,
// allowing the provider to manage companies, documents, projects etc.
providerRoutes.post("/cabinets/:id/access", providerAuth, async (c) => {
  const orgId = c.req.param("id");

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  if (!org) return c.json({ error: "Cabinet negăsit" }, 404);

  // Find the admin user for this cabinet
  let adminUser = await db.query.users.findFirst({
    where: and(eq(users.organizationId, orgId), eq(users.role, "admin")),
  });

  // If no admin exists, create a provider-managed admin user
  if (!adminUser) {
    const providerUser = await db.query.providerUsers.findFirst({
      where: eq(providerUsers.id, c.get("providerId") as string),
    });

    const passwordHash = await bcrypt.hash("provider-managed-" + Date.now(), 12);
    const [newUser] = await db.insert(users).values({
      email: providerUser?.email || `provider-admin@${org.code.toLowerCase()}.local`,
      name: providerUser?.name || "Provider Admin",
      passwordHash,
      organizationId: orgId,
      role: "admin",
      status: "active",
    }).returning();

    adminUser = newUser;
  }

  // Generate a user-level JWT (same as regular login) valid for 4 hours
  const token = await sign(
    { sub: adminUser.id, exp: Math.floor(Date.now() / 1000) + 4 * 3600 },
    process.env.JWT_SECRET!,
    "HS256",
  );

  return c.json({
    token,
    user: {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role,
    },
    organization: {
      id: org.id,
      name: org.name,
      plan: org.plan,
    },
  });
});
