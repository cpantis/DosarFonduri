# FAZA 7 — Admin & Configurări
## Utilizatori, Audit AI Costuri, Jurnal Activitate, Configurări, Provider Dashboard

**Dependențe**: Fazele 1-6 completate

---

## 7.1 ROUTES ADMIN

```typescript
// apps/api/src/routes/admin.ts
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { users, auditLog, aiUsageLog, projects, organizations } from "../db/schema";
import { eq, and, desc, sql, gte, lte, between } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";

export const adminRoutes = new Hono();

// Verificare rol admin
const requireAdmin = async (c: any, next: any) => {
  const auth = c.get("auth") as AuthContext;
  if (auth.role !== "admin") return c.json({ error: "Acces interzis — doar administratori" }, 403);
  await next();
};

// ═══ UTILIZATORI ═══

// Lista utilizatori organizație
adminRoutes.get("/users", async (c) => {
  const auth = c.get("auth") as AuthContext;

  const result = await db.query.users.findMany({
    where: eq(users.organizationId, auth.organizationId!),
    orderBy: [desc(users.createdAt)],
  });

  // Enrich cu nr. proiecte per user
  const enriched = await Promise.all(result.map(async (u) => {
    const projectCount = await db.select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(eq(projects.consultantId, u.id));

    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      lastActiveAt: u.lastActiveAt,
      projectCount: projectCount[0]?.count || 0,
    };
  }));

  return c.json(enriched);
});

// Adaugă utilizator (pre-înregistrare email + rol)
const addUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "consultant", "viewer"]),
});

adminRoutes.post("/users", requireAdmin, async (c) => {
  const auth = c.get("auth") as AuthContext;
  const body = addUserSchema.parse(await c.req.json());

  // Check max users din plan
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, auth.organizationId!),
  });
  const currentUsers = await db.select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(
      eq(users.organizationId, auth.organizationId!),
      eq(users.status, "active"),
    ));

  if (org && currentUsers[0]?.count >= org.maxUsers) {
    return c.json({ error: `Limita de ${org.maxUsers} utilizatori atinsă. Actualizează planul.` }, 400);
  }

  // Check dacă email-ul există deja
  const existing = await db.query.users.findFirst({ where: eq(users.email, body.email) });
  if (existing) {
    if (existing.organizationId === auth.organizationId) {
      return c.json({ error: "Utilizatorul există deja în cabinet" }, 400);
    }
    if (existing.organizationId) {
      return c.json({ error: "Email-ul este deja asociat altui cabinet" }, 400);
    }
    // User pending_cabinet → atașează la organizație
    await db.update(users).set({
      organizationId: auth.organizationId,
      role: body.role,
      status: "active",
      invitedBy: auth.userId,
    }).where(eq(users.id, existing.id));
    return c.json({ ...existing, role: body.role, status: "active" });
  }

  // Pre-înregistrare (user nu există încă)
  const [user] = await db.insert(users).values({
    email: body.email,
    name: body.email.split("@")[0], // placeholder, se completează la signup
    passwordHash: "", // se setează la signup
    organizationId: auth.organizationId,
    role: body.role,
    status: "invited",
    invitedBy: auth.userId,
  }).returning();

  return c.json(user, 201);
});

// Schimbă rol utilizator
adminRoutes.put("/users/:id", requireAdmin, async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const body = await c.req.json();

  // Nu-ți poți schimba propriul rol
  if (id === auth.userId && body.role) {
    return c.json({ error: "Nu îți poți schimba propriul rol" }, 400);
  }

  const [updated] = await db.update(users).set({
    role: body.role,
    status: body.status,
  }).where(
    and(eq(users.id, id), eq(users.organizationId, auth.organizationId!))
  ).returning();

  return c.json(updated);
});

// ═══ AUDIT AI COSTURI ═══

adminRoutes.get("/ai-costs", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const period = c.req.query("period") || "month"; // month, week, all

  let dateFilter;
  const now = new Date();
  if (period === "month") {
    dateFilter = gte(aiUsageLog.createdAt, new Date(now.getFullYear(), now.getMonth(), 1));
  } else if (period === "week") {
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    dateFilter = gte(aiUsageLog.createdAt, weekAgo);
  }

  const whereClause = dateFilter
    ? and(eq(aiUsageLog.organizationId, auth.organizationId!), dateFilter)
    : eq(aiUsageLog.organizationId, auth.organizationId!);

  // Total per agent
  const byAgent = await db.select({
    agent: aiUsageLog.agent,
    totalCost: sql<number>`sum(${aiUsageLog.cost})::float`,
    totalCalls: sql<number>`count(*)::int`,
    totalTokensIn: sql<number>`sum(${aiUsageLog.tokensInput})::int`,
    totalTokensOut: sql<number>`sum(${aiUsageLog.tokensOutput})::int`,
  })
    .from(aiUsageLog)
    .where(whereClause)
    .groupBy(aiUsageLog.agent);

  // Total per proiect
  const byProject = await db.select({
    projectId: aiUsageLog.projectId,
    projectName: projects.name,
    companyName: sql<string>`(SELECT denumire FROM companies WHERE id = ${projects.companyId})`,
    agent: aiUsageLog.agent,
    totalCost: sql<number>`sum(${aiUsageLog.cost})::float`,
    totalCalls: sql<number>`count(*)::int`,
  })
    .from(aiUsageLog)
    .leftJoin(projects, eq(projects.id, aiUsageLog.projectId))
    .where(whereClause)
    .groupBy(aiUsageLog.projectId, projects.name, projects.companyId, aiUsageLog.agent);

  // Pivot per proiect cu breakdown pe agent
  const projectMap: Record<string, any> = {};
  for (const row of byProject) {
    if (!row.projectId) continue;
    if (!projectMap[row.projectId]) {
      projectMap[row.projectId] = {
        projectId: row.projectId,
        name: row.projectName,
        firma: row.companyName,
        solomon: { cost: 0, calls: 0 },
        neemia: { cost: 0, calls: 0 },
        ocr: { cost: 0, calls: 0 },
        ghid_rules: { cost: 0, calls: 0 },
        total: 0,
      };
    }
    const agent = row.agent as string;
    if (projectMap[row.projectId][agent]) {
      projectMap[row.projectId][agent].cost += row.totalCost || 0;
      projectMap[row.projectId][agent].calls += row.totalCalls || 0;
    }
    projectMap[row.projectId].total += row.totalCost || 0;
  }

  // Cost zilnic (ultimele 30 zile)
  const dailyCosts = await db.select({
    date: sql<string>`date(${aiUsageLog.createdAt})`,
    totalCost: sql<number>`sum(${aiUsageLog.cost})::float`,
  })
    .from(aiUsageLog)
    .where(and(
      eq(aiUsageLog.organizationId, auth.organizationId!),
      gte(aiUsageLog.createdAt, new Date(now.getTime() - 30 * 86400000)),
    ))
    .groupBy(sql`date(${aiUsageLog.createdAt})`)
    .orderBy(sql`date(${aiUsageLog.createdAt})`);

  // Total luna curentă vs. luna trecută
  const currentMonthTotal = byAgent.reduce((sum, a) => sum + (a.totalCost || 0), 0);

  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const prevMonth = await db.select({
    totalCost: sql<number>`sum(${aiUsageLog.cost})::float`,
  })
    .from(aiUsageLog)
    .where(and(
      eq(aiUsageLog.organizationId, auth.organizationId!),
      between(aiUsageLog.createdAt, prevMonthStart, prevMonthEnd),
    ));

  return c.json({
    totalMonth: currentMonthTotal,
    totalPrevMonth: prevMonth[0]?.totalCost || 0,
    byAgent: byAgent.reduce((acc, a) => {
      acc[a.agent] = { cost: a.totalCost || 0, calls: a.totalCalls || 0, tokensIn: a.totalTokensIn || 0, tokensOut: a.totalTokensOut || 0 };
      return acc;
    }, {} as Record<string, any>),
    byProject: Object.values(projectMap).sort((a: any, b: any) => b.total - a.total),
    daily: dailyCosts,
  });
});

// ═══ JURNAL ACTIVITATE ═══

adminRoutes.get("/audit-log", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");
  const type = c.req.query("type"); // filter by entity_type

  let whereClause = eq(auditLog.organizationId, auth.organizationId!);
  if (type) {
    whereClause = and(whereClause, eq(auditLog.entityType, type)) as any;
  }

  const result = await db.query.auditLog.findMany({
    where: whereClause,
    orderBy: [desc(auditLog.createdAt)],
    limit,
    offset,
  });

  // Enrich cu user name
  const enriched = await Promise.all(result.map(async (log) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, log.userId) });
    return {
      ...log,
      userName: user?.name || "Unknown",
    };
  }));

  return c.json(enriched);
});
```

---

## 7.2 ROUTES CONFIGURĂRI

```typescript
// apps/api/src/routes/config.ts
import { Hono } from "hono";
import { db } from "../db";
import { orgConfig, apiIntegrations } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";
import { encrypt, decrypt } from "../lib/crypto";

export const configRoutes = new Hono();

// ─── GET CONFIG ───
configRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  let config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, auth.organizationId!),
  });

  // Creare config default dacă nu există
  if (!config) {
    const [created] = await db.insert(orgConfig).values({
      organizationId: auth.organizationId!,
    }).returning();
    config = created;
  }

  return c.json(config);
});

// ─── UPDATE CONFIG ───
configRoutes.put("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (auth.role !== "admin") return c.json({ error: "Doar admin" }, 403);

  const body = await c.req.json();

  const [updated] = await db.update(orgConfig).set({
    ...body,
    updatedAt: new Date(),
  }).where(eq(orgConfig.organizationId, auth.organizationId!)).returning();

  return c.json(updated);
});

// ─── API INTEGRATIONS ───

configRoutes.get("/api-integrations", async (c) => {
  const auth = c.get("auth") as AuthContext;

  const integrations = await db.query.apiIntegrations.findMany({
    where: eq(apiIntegrations.organizationId, auth.organizationId!),
  });

  // Mask API keys
  return c.json(integrations.map(i => ({
    ...i,
    apiKeyMasked: i.apiKeyEncrypted
      ? "****" + decrypt(i.apiKeyEncrypted).slice(-4)
      : null,
    apiKeyEncrypted: undefined, // nu expune encrypted key
  })));
});

configRoutes.post("/api-integrations", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (auth.role !== "admin") return c.json({ error: "Doar admin" }, 403);

  const { name, type, url, apiKey } = await c.req.json();

  const [integration] = await db.insert(apiIntegrations).values({
    organizationId: auth.organizationId!,
    name,
    type,
    url,
    apiKeyEncrypted: apiKey ? encrypt(apiKey) : null,
    status: "configured",
  }).returning();

  return c.json({
    ...integration,
    apiKeyMasked: apiKey ? "****" + apiKey.slice(-4) : null,
    apiKeyEncrypted: undefined,
  }, 201);
});

configRoutes.put("/api-integrations/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (auth.role !== "admin") return c.json({ error: "Doar admin" }, 403);

  const id = c.req.param("id");
  const body = await c.req.json();

  const updateData: any = { ...body };
  if (body.apiKey) {
    updateData.apiKeyEncrypted = encrypt(body.apiKey);
    delete updateData.apiKey;
  }

  const [updated] = await db.update(apiIntegrations).set(updateData).where(
    and(eq(apiIntegrations.id, id), eq(apiIntegrations.organizationId, auth.organizationId!))
  ).returning();

  return c.json(updated);
});

configRoutes.delete("/api-integrations/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (auth.role !== "admin") return c.json({ error: "Doar admin" }, 403);

  const id = c.req.param("id");
  await db.delete(apiIntegrations).where(
    and(eq(apiIntegrations.id, id), eq(apiIntegrations.organizationId, auth.organizationId!))
  );

  return c.json({ ok: true });
});

// Test conexiune API
configRoutes.post("/api-integrations/:id/test", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const integration = await db.query.apiIntegrations.findFirst({
    where: and(eq(apiIntegrations.id, id), eq(apiIntegrations.organizationId, auth.organizationId!)),
  });
  if (!integration) return c.json({ error: "Not found" }, 404);

  try {
    const apiKey = integration.apiKeyEncrypted ? decrypt(integration.apiKeyEncrypted) : "";

    const response = await fetch(integration.url + "/health", {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    const ok = response.ok;
    const result = ok ? "OK" : `HTTP ${response.status}`;

    await db.update(apiIntegrations).set({
      lastTestedAt: new Date(),
      lastTestResult: result,
      status: ok ? "connected" : "error",
    }).where(eq(apiIntegrations.id, id));

    return c.json({ ok, message: result });
  } catch (err: any) {
    const result = `Error: ${err.message}`;
    await db.update(apiIntegrations).set({
      lastTestedAt: new Date(),
      lastTestResult: result,
      status: "error",
    }).where(eq(apiIntegrations.id, id));

    return c.json({ ok: false, message: result });
  }
});
```

---

## 7.3 USER THEME & PREFERENCES

```typescript
// Adăugare în auth routes
// apps/api/src/routes/auth.ts (adăugare la fișierul existent)

authRoutes.patch("/preferences", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const payload = await verify(token, process.env.JWT_SECRET!);
  const { theme } = await c.req.json();

  if (theme && (theme === "dark" || theme === "light")) {
    await db.update(users).set({ theme }).where(eq(users.id, payload.sub as string));
  }

  return c.json({ ok: true });
});
```

---

## 7.4 FRONTEND: ADMIN PAGE

### Referință UI: `07_Admin.jsx`

**3 tab-uri:**

**👥 Utilizatori**
- Lista cu card per user: avatar, nume, email, badge rol, badge status, proiecte, last active
- Click expand: detalii + permisiuni pe rol + acțiuni (schimbă rol, dezactivează)
- Buton "Invită consultant" → admin introduce doar email + rol → salvare
- Fără email automat, fără link invitație — admin comunică verbal consultantului "fă-ți cont cu emailul ăsta"

**💰 Audit AI / Costuri**
- 4 KPI cards: total luna curentă, Solomon, Neemia, OCR+Ghid
- Bară distribuție per agent (stacked, colorată)
- Grafic bare zilnic (ultimele 30 zile)
- Tabel detaliat per proiect: proiect/firmă, Solomon $, Neemia $, OCR $, Ghid $, TOTAL

**📋 Jurnal activitate**
- Filtre: Toate / Creare / Upload / Utilizatori / Config
- Timeline cu icon per tip, acțiune, detaliu, user + timestamp
- Paginare (50 per pagină)

---

## 7.5 FRONTEND: CONFIGURĂRI

### Referință UI: `06_Configurari.jsx`

**6 secțiuni (navigare stânga):**

1. **🤖 Solomon** — model select (Haiku/Sonnet/Opus carduri), toggle ET, cost estimat
2. **📝 Neemia** — model select, streaming toggle, validare automată toggle
3. **📖 Ghid** — model reguli fixe/interpretate (dropdown), toggle ET, prag review (%)
4. **🔌 Integrare API** — carduri API (icon, name, type, URL, key masked, status, last test) + ⚡ Test + ✏️ Edit + 🗑 Delete + "Adaugă integrare"
5. **🔔 Notificări** — email from + 4 toggles (element extras, eligibilitate, template ready, deadline)
6. **📤 Export & Backup** — 4 butoane grid (export proiecte ZIP, config JSON, backup DB, raport CSV)

**Tema:** toggle ☀️/🌙 în sidebar footer (per user), NU în configurări

---

## 7.6 PROVIDER DASHBOARD COMPLET

### Referință UI: `00_Provider.jsx`

**Rută separată /provider** cu login propriu (mov branding)

**Sidebar:** Cabinete, Coduri nefolosite, Revenue

**Funcționalități:**
- Lista cabinete cu filtre (Active/Trial/Inactive), search, status, cost AI, users
- Expand detalii cabinet: plan, users, proiecte, storage, contact, telefon, creat
- Acțiuni: editează plan, trimite email, regenerează cod, activează complet, dezactivează
- Coduri nefolosite: card cu cod, plan, trial, expirare, buton copiază/șterge
- Generare cod: modal cu plan select + max users + trial days → cod aleatoriu
- Revenue: MRR, cost AI total, marjă netă, tabel per cabinet cu breakdown

---

## 7.7 CHECKLIST FAZA 7

- [ ] Route admin: lista utilizatori cu project count
- [ ] Route admin: adaugă utilizator (email + rol, pre-înregistrare)
- [ ] Route admin: schimbă rol / dezactivează utilizator
- [ ] Route admin: audit AI costuri (per agent, per proiect, daily, comparație luni)
- [ ] Route admin: jurnal activitate (cu filtre și paginare)
- [ ] Route config: get/update configurări organizație
- [ ] Route config: CRUD integrări API cu encryption
- [ ] Route config: test conexiune API
- [ ] Route auth: PATCH preferences (theme)
- [ ] Frontend: pagina Admin cu 3 tab-uri (07_Admin.jsx referință)
- [ ] Frontend: pagina Configurări cu 6 secțiuni (06_Configurari.jsx referință)
- [ ] Frontend: Provider dashboard complet (00_Provider.jsx referință)
- [ ] Frontend: Provider login separat
