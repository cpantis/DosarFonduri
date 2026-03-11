import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { orgConfig, apiIntegrations, solomonKnowledge, organizations } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto";
import type { AuthContext } from "../middleware/auth";

export const configRoutes = new Hono<AppEnv>();

// ─── GET / (org config) ───
configRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  let config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, auth.organizationId),
  });

  // Auto-create default config if missing
  if (!config) {
    const [created] = await db
      .insert(orgConfig)
      .values({ organizationId: auth.organizationId })
      .returning();
    config = created;
  }

  return c.json(config);
});

// ─── PUT / (update org config) ───
const configUpdateSchema = z.object({
  solomonModel: z.string().optional(),
  solomonET: z.boolean().optional(),
  neemiaModel: z.string().optional(),
  reguliFixeModel: z.string().optional(),
  reguliInterpModel: z.string().optional(),
  reguliInterpET: z.boolean().optional(),
  reviewThreshold: z.string().optional(),
  notifNewElement: z.boolean().optional(),
  notifEligFail: z.boolean().optional(),
  notifTemplateReady: z.boolean().optional(),
  notifDeadline: z.boolean().optional(),
  emailFrom: z.string().optional(),
});

configRoutes.put("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const body = configUpdateSchema.parse(await c.req.json());

  // Ensure config exists
  let config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, auth.organizationId),
  });

  if (!config) {
    const [created] = await db
      .insert(orgConfig)
      .values({ organizationId: auth.organizationId })
      .returning();
    config = created;
  }

  const [updated] = await db
    .update(orgConfig)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(orgConfig.organizationId, auth.organizationId))
    .returning();

  return c.json(updated);
});

// ─── GET /api-integrations ───
configRoutes.get("/api-integrations", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const integrations = await db.query.apiIntegrations.findMany({
    where: eq(apiIntegrations.organizationId, auth.organizationId),
  });

  // Mask API keys
  const masked = integrations.map((api) => ({
    ...api,
    apiKeyMasked: api.apiKeyEncrypted
      ? maskKey(decrypt(api.apiKeyEncrypted))
      : null,
    apiKeyEncrypted: undefined,
  }));

  return c.json(masked);
});

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

// ─── POST /api-integrations ───
const apiIntegrationSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  url: z.string().url(),
  apiKey: z.string().optional(),
  enabled: z.boolean().optional(),
  autoSync: z.boolean().optional(),
  syncIntervalDays: z.number().optional(),
});

configRoutes.post("/api-integrations", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const body = apiIntegrationSchema.parse(await c.req.json());

  const [created] = await db
    .insert(apiIntegrations)
    .values({
      organizationId: auth.organizationId,
      name: body.name,
      type: body.type,
      url: body.url,
      apiKeyEncrypted: body.apiKey ? encrypt(body.apiKey) : null,
      autoSync: body.autoSync ?? false,
      syncIntervalDays: body.syncIntervalDays ?? 7,
      status: "configured",
    })
    .returning();

  return c.json(
    {
      ...created,
      apiKeyMasked: body.apiKey ? maskKey(body.apiKey) : null,
      apiKeyEncrypted: undefined,
    },
    201
  );
});

// ─── PUT /api-integrations/:id ───
configRoutes.put("/api-integrations/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const id = c.req.param("id");
  const body = apiIntegrationSchema.partial().parse(await c.req.json());

  // Verify belongs to org
  const existing = await db.query.apiIntegrations.findFirst({
    where: and(
      eq(apiIntegrations.id, id),
      eq(apiIntegrations.organizationId, auth.organizationId)
    ),
  });
  if (!existing) return c.json({ error: "Integration not found" }, 404);

  const updates: Record<string, any> = {};
  if (body.name) updates.name = body.name;
  if (body.type) updates.type = body.type;
  if (body.url) updates.url = body.url;
  if (body.apiKey !== undefined) {
    updates.apiKeyEncrypted = body.apiKey ? encrypt(body.apiKey) : null;
  }
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.autoSync !== undefined) updates.autoSync = body.autoSync;
  if (body.syncIntervalDays !== undefined) updates.syncIntervalDays = body.syncIntervalDays;

  const [updated] = await db
    .update(apiIntegrations)
    .set(updates)
    .where(eq(apiIntegrations.id, id))
    .returning();

  return c.json({
    ...updated,
    apiKeyMasked: updated.apiKeyEncrypted
      ? maskKey(decrypt(updated.apiKeyEncrypted))
      : null,
    apiKeyEncrypted: undefined,
  });
});

// ─── DELETE /api-integrations/:id ───
configRoutes.delete("/api-integrations/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const id = c.req.param("id");

  const existing = await db.query.apiIntegrations.findFirst({
    where: and(
      eq(apiIntegrations.id, id),
      eq(apiIntegrations.organizationId, auth.organizationId)
    ),
  });
  if (!existing) return c.json({ error: "Integration not found" }, 404);

  await db.delete(apiIntegrations).where(eq(apiIntegrations.id, id));
  return c.json({ ok: true });
});

// ─── POST /api-integrations/:id/test ───
configRoutes.post("/api-integrations/:id/test", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const id = c.req.param("id");

  const integration = await db.query.apiIntegrations.findFirst({
    where: and(
      eq(apiIntegrations.id, id),
      eq(apiIntegrations.organizationId, auth.organizationId)
    ),
  });
  if (!integration) return c.json({ error: "Integration not found" }, 404);

  try {
    // Attempt a HEAD/GET request to the API URL
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const headers: Record<string, string> = {};
    if (integration.apiKeyEncrypted) {
      const key = decrypt(integration.apiKeyEncrypted);
      headers["Authorization"] = `Bearer ${key}`;
    }

    const res = await fetch(integration.url, {
      method: "HEAD",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const success = res.ok || res.status === 405; // Some APIs don't support HEAD
    const result = success ? "OK" : `HTTP ${res.status}`;

    await db
      .update(apiIntegrations)
      .set({
        lastTestedAt: new Date(),
        lastTestResult: result,
        status: success ? "connected" : "error",
      })
      .where(eq(apiIntegrations.id, id));

    return c.json({ success, result, status: res.status });
  } catch (err: any) {
    const result = err.name === "AbortError" ? "Timeout" : err.message;

    await db
      .update(apiIntegrations)
      .set({
        lastTestedAt: new Date(),
        lastTestResult: result,
        status: "error",
      })
      .where(eq(apiIntegrations.id, id));

    return c.json({ success: false, result });
  }
});

// ═══════════════════════════════════════════
// SOLOMON KNOWLEDGE BASE — actualizări legislative, bune practici, corecții
// ═══════════════════════════════════════════

// ─── GET /knowledge ───
configRoutes.get("/knowledge", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const entries = await db.query.solomonKnowledge.findMany({
    where: eq(solomonKnowledge.organizationId, auth.organizationId),
    orderBy: (k, { desc }) => [desc(k.priority), desc(k.createdAt)],
  });

  return c.json(entries);
});

// ─── POST /knowledge ───
const knowledgeCreateSchema = z.object({
  category: z.enum(["legislatie", "praguri", "proceduri", "ghid_specific", "bune_practici", "corectii"]),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  sourceReference: z.string().max(500).optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

configRoutes.post("/knowledge", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);
  if (auth.role !== "admin" && auth.role !== "consultant") {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  const body = knowledgeCreateSchema.parse(await c.req.json());

  const [created] = await db
    .insert(solomonKnowledge)
    .values({
      organizationId: auth.organizationId,
      category: body.category,
      title: body.title,
      content: body.content,
      sourceUrl: body.sourceUrl,
      sourceReference: body.sourceReference,
      validFrom: body.validFrom ? new Date(body.validFrom) : null,
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
      priority: body.priority ?? 0,
      createdBy: auth.userId,
    })
    .returning();

  return c.json(created, 201);
});

// ─── PUT /knowledge/:id ───
configRoutes.put("/knowledge/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);
  if (auth.role !== "admin" && auth.role !== "consultant") {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  const id = c.req.param("id");
  const body = knowledgeCreateSchema.partial().parse(await c.req.json());

  const existing = await db.query.solomonKnowledge.findFirst({
    where: and(
      eq(solomonKnowledge.id, id),
      eq(solomonKnowledge.organizationId, auth.organizationId),
    ),
  });
  if (!existing) return c.json({ error: "Knowledge entry not found" }, 404);

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (body.category) updates.category = body.category;
  if (body.title) updates.title = body.title;
  if (body.content) updates.content = body.content;
  if (body.sourceUrl !== undefined) updates.sourceUrl = body.sourceUrl || null;
  if (body.sourceReference !== undefined) updates.sourceReference = body.sourceReference || null;
  if (body.validFrom !== undefined) updates.validFrom = body.validFrom ? new Date(body.validFrom) : null;
  if (body.validUntil !== undefined) updates.validUntil = body.validUntil ? new Date(body.validUntil) : null;
  if (body.priority !== undefined) updates.priority = body.priority;

  const [updated] = await db
    .update(solomonKnowledge)
    .set(updates)
    .where(eq(solomonKnowledge.id, id))
    .returning();

  return c.json(updated);
});

// ─── PATCH /knowledge/:id/toggle ───
configRoutes.patch("/knowledge/:id/toggle", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const id = c.req.param("id");

  const existing = await db.query.solomonKnowledge.findFirst({
    where: and(
      eq(solomonKnowledge.id, id),
      eq(solomonKnowledge.organizationId, auth.organizationId),
    ),
  });
  if (!existing) return c.json({ error: "Knowledge entry not found" }, 404);

  const [updated] = await db
    .update(solomonKnowledge)
    .set({ enabled: !existing.enabled, updatedAt: new Date() })
    .where(eq(solomonKnowledge.id, id))
    .returning();

  return c.json(updated);
});

// ─── DELETE /knowledge/:id ───
configRoutes.delete("/knowledge/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);
  if (auth.role !== "admin") {
    return c.json({ error: "Admin only" }, 403);
  }

  const id = c.req.param("id");

  const existing = await db.query.solomonKnowledge.findFirst({
    where: and(
      eq(solomonKnowledge.id, id),
      eq(solomonKnowledge.organizationId, auth.organizationId),
    ),
  });
  if (!existing) return c.json({ error: "Knowledge entry not found" }, 404);

  await db.delete(solomonKnowledge).where(eq(solomonKnowledge.id, id));
  return c.json({ ok: true });
});

// ─── GET /branding (cabinet document style) ───
configRoutes.get("/branding", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, auth.organizationId),
  });

  return c.json(org?.cabinetDocumentStyle || {});
});

// ─── PUT /branding (update cabinet document style) ───
const brandingSchema = z.object({
  primaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  fontFamily: z.string().optional(),
  logoUrl: z.string().optional(),
  footerText: z.string().optional(),
  highlightColor: z.string().optional(),
  warningColor: z.string().optional(),
  logoOnWorkDocs: z.boolean().optional(),
  logoOnFinalDocs: z.boolean().optional(),
});

configRoutes.put("/branding", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);
  if (auth.role !== "admin") return c.json({ error: "Admin only" }, 403);

  const body = brandingSchema.parse(await c.req.json());

  // Merge with existing style
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, auth.organizationId),
  });
  const existingStyle = (org?.cabinetDocumentStyle || {}) as Record<string, any>;
  const merged = { ...existingStyle, ...body };

  const [updated] = await db
    .update(organizations)
    .set({ cabinetDocumentStyle: merged })
    .where(eq(organizations.id, auth.organizationId))
    .returning();

  return c.json(updated.cabinetDocumentStyle || {});
});
