import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { orgConfig, apiIntegrations } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto";
import type { AuthContext } from "../middleware/auth";

export const configRoutes = new Hono();

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
