import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { orgConfig, apiIntegrations, solomonKnowledge, organizations, referenceValues } from "../db/schema";
import { DEFAULT_REFERENCE_VALUES } from "@dosarfonduri/shared";
import { eq, and, sql } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto";
import type { AuthContext } from "../middleware/auth";
import { extractTextFromPDF, extractTextFromDOCX } from "../services/ocr";
import { anthropic, withAILimit } from "../lib/anthropic";
import { logAIUsage } from "../services/aiUsage";
import { repairTruncatedJSON } from "../lib/safeExtract";
import { publishJobProgress } from "../lib/sse";

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
  solomonModel: z.string().nullish(),
  solomonET: z.boolean().nullish(),
  neemiaModel: z.string().nullish(),
  reguliFixeModel: z.string().nullish(),
  reguliInterpModel: z.string().nullish(),
  reguliInterpET: z.boolean().nullish(),
  reviewThreshold: z.string().nullish(),
  solomonLabel: z.string().max(100).nullish(),
  neemiaLabel: z.string().max(100).nullish(),
  notifNewElement: z.boolean().nullish(),
  notifEligFail: z.boolean().nullish(),
  notifTemplateReady: z.boolean().nullish(),
  notifDeadline: z.boolean().nullish(),
  emailFrom: z.string().nullish(),
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
    // Special handling for ListaFirme: test with a known CUI
    if (integration.type === "ListaFirme" && integration.apiKeyEncrypted) {
      const apiKey = decrypt(integration.apiKeyEncrypted);
      const testBody = `key=${encodeURIComponent(apiKey)}&data=${encodeURIComponent(JSON.stringify({ TaxCode: "1", Name: "" }))}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch("https://listafirme.ro/api/info-v2.asp", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: testBody,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const json = await res.json().catch(() => null);
      // A valid key returns a response (even if CUI not found), invalid key returns auth error
      const isAuthError = json?.error?.toLowerCase()?.includes("invalid key") ||
                          json?.error?.toLowerCase()?.includes("unauthorized") ||
                          json?.error?.toLowerCase()?.includes("expired");
      const success = res.ok && !isAuthError;
      const result = isAuthError ? "Cheie API invalidă sau expirată" : success ? "OK — conexiune validă" : `HTTP ${res.status}`;

      await db
        .update(apiIntegrations)
        .set({
          lastTestedAt: new Date(),
          lastTestResult: result,
          status: success ? "connected" : "error",
        })
        .where(eq(apiIntegrations.id, id));

      return c.json({ success, result, status: res.status });
    }

    // SSRF protection: only allow HTTPS URLs to public domains
    const parsedUrl = new URL(integration.url);
    const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "169.254.169.254", "metadata.google.internal"];
    if (blockedHosts.includes(parsedUrl.hostname) || parsedUrl.hostname.endsWith(".local") || parsedUrl.protocol !== "https:") {
      return c.json({ success: false, result: "URL-ul nu este permis (doar HTTPS către domenii publice)" }, 400);
    }
    // Block private IP ranges
    const ipMatch = parsedUrl.hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
        return c.json({ success: false, result: "URL-ul nu este permis (adresă IP privată)" }, 400);
      }
    }

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
      redirect: "manual", // Don't follow redirects (prevent SSRF via redirect)
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

// ─── POST /knowledge/upload — Upload document → extract → save as knowledge entries ───
configRoutes.post("/knowledge/upload", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return c.json({ error: "Lipsește fișierul" }, 400);

  const fileName = file.name || "document";
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!["pdf", "docx", "doc"].includes(ext || "")) {
    return c.json({ error: "Format nesuportat. Acceptăm: PDF, DOCX" }, 400);
  }

  // Size limit: 50MB
  if (file.size > 50 * 1024 * 1024) {
    return c.json({ error: "Fișierul depășește 50MB" }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Step 1: Extract text
  let rawText = "";
  try {
    if (ext === "pdf") {
      const pdfResult = await extractTextFromPDF(buffer);
      rawText = pdfResult.text;
    } else {
      rawText = await extractTextFromDOCX(buffer, fileName);
    }
  } catch (err: any) {
    return c.json({ error: `Eroare la extragerea textului: ${err.message}` }, 500);
  }

  if (rawText.length < 100) {
    return c.json({ error: "Documentul nu conține text suficient" }, 400);
  }

  const totalPages = (rawText.match(/--- Pagina \d+/g) || []).length || 1;
  const totalChars = rawText.length;

  // Step 2: Split into chunks
  const CHUNK_LIMIT = 120000;
  const chunks: string[] = [];
  if (rawText.length <= CHUNK_LIMIT) {
    chunks.push(rawText);
  } else {
    const pageDelimiter = /--- Pagina \d+/g;
    const pageStarts: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = pageDelimiter.exec(rawText)) !== null) pageStarts.push(m.index);
    if (pageStarts.length <= 1) {
      chunks.push(rawText.slice(0, CHUNK_LIMIT));
    } else {
      let chunkStart = 0;
      while (chunkStart < pageStarts.length) {
        let chunkEnd = chunkStart;
        for (let i = chunkStart + 1; i < pageStarts.length; i++) {
          if (pageStarts[i] - pageStarts[chunkStart] > CHUNK_LIMIT) break;
          chunkEnd = i;
        }
        const startIdx = pageStarts[chunkStart];
        const endIdx = chunkEnd + 1 < pageStarts.length ? pageStarts[chunkEnd + 1] : rawText.length;
        chunks.push(rawText.slice(startIdx, endIdx));
        chunkStart = chunkEnd + 1;
        if (chunkEnd >= pageStarts.length - 1) break;
      }
    }
  }

  const sourceTag = `upload:${fileName}`;

  // Delete previous entries (for re-upload)
  await db.delete(solomonKnowledge).where(
    and(
      eq(solomonKnowledge.organizationId, auth.organizationId),
      eq(solomonKnowledge.sourceReference, sourceTag),
    ),
  );

  const estMinutes = Math.ceil((chunks.length * 30 + 10) / 60);
  const orgId = auth.organizationId;
  const userId = auth.userId;

  // Publish initial SSE progress
  publishJobProgress(orgId, {
    jobId: `kb-upload-${fileName}`,
    jobType: "knowledge_upload",
    progress: 5,
    status: "processing",
    message: `Procesez "${fileName}" — ${totalPages} pagini, ${chunks.length} secțiuni. Estimare: ~${estMinutes} min`,
  }).catch(() => {});

  // Process async in background — return immediately
  (async () => {
    const SYSTEM = `Ești Solomon — consultant senior cu 15+ ani experiență în fonduri europene.
Citești un document strategic/legislativ și extragi informațiile pe care un consultant le folosește pentru:
1. JUSTIFICAREA proiectelor — obiective naționale, target-uri, priorități
2. ARGUMENTAREA punctajului — date statistice, cifre oficiale
3. CONTEXT LEGISLATIV — definiții, cadru legal, termene
4. REFERINȚE CITABILE — paragrafe exacte pentru cererea de finanțare
Concentrează-te pe: cifre concrete, procente, target-uri cu an, măsuri specifice, definiții oficiale.
Returnează DOAR JSON valid. Fără backticks, fără explicații.`;

    let savedCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      try {
        const response: any = await withAILimit(() => (anthropic.messages.create as any)({
          model: "claude-sonnet-4-6",
          max_tokens: 16000,
          system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: `Extrage secțiunile-cheie din acest document.

Returnează: { "sections": [{ "title": "...", "category": "obiective|target_cifre|masuri_politici|cadru_legal|definitii|statistici|prioritati|calendar", "content": "textul COMPLET (consultantul citează exact)", "source_page": N, "relevance": "pentru ce programe e relevant" }] }

TEXT DOCUMENT (chunk ${i + 1}/${chunks.length}):
${chunks[i]}` }],
        }));

        const textBlock = response.content.find((b: any) => b.type === "text");
        const content = textBlock ? textBlock.text : "";

        await logAIUsage({
          organizationId: orgId,
          agent: "reference_extractor",
          model: "claude-sonnet-4-6",
          tokensInput: response.usage.input_tokens,
          tokensOutput: response.usage.output_tokens,
          action: `knowledge_upload_chunk_${i + 1}`,
        });

        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        let parsed: any = null;
        try { parsed = JSON.parse(cleaned); } catch { parsed = repairTruncatedJSON(content); }
        if (parsed?.sections && Array.isArray(parsed.sections)) {
          for (const section of parsed.sections) {
            if (!section.title || !section.content) continue;
            try {
              const entryTitle = `${fileName.replace(/\.[^.]+$/, "")} — ${section.title}`.slice(0, 500);
              const [entry] = await db.insert(solomonKnowledge).values({
                organizationId: orgId,
                category: `referinta_${section.category || "general"}`,
                title: entryTitle,
                content: section.content,
                sourceReference: sourceTag,
                sourceUrl: null,
                validFrom: null,
                validUntil: null,
                priority: 5,
                enabled: true,
                createdBy: userId,
              }).returning({ id: solomonKnowledge.id });
              savedCount++;
            } catch {}
          }
        }

        // SSE progress per chunk
        publishJobProgress(orgId, {
          jobId: `kb-upload-${fileName}`,
          jobType: "knowledge_upload",
          progress: 5 + Math.round(((i + 1) / chunks.length) * 90),
          status: "processing",
          message: `Secțiunea ${i + 1} din ${chunks.length} procesată — ${savedCount} intrări extrase`,
        }).catch(() => {});

      } catch (err: any) {
        console.warn(`[knowledge/upload] Chunk ${i + 1} failed:`, err.message);
      }
    }

    // SSE completion
    publishJobProgress(orgId, {
      jobId: `kb-upload-${fileName}`,
      jobType: "knowledge_upload",
      progress: 100,
      status: "completed",
      message: `${savedCount} secțiuni extrase din "${fileName}" — disponibile in Solomon și Neemia`,
    }).catch(() => {});

    console.log(`[knowledge/upload] "${fileName}" complete: ${savedCount} secțiuni din ${totalPages} pagini (${chunks.length} chunks)`);
  })().catch(err => console.error(`[knowledge/upload] Background processing failed:`, err));

  // Return immediately
  return c.json({
    ok: true,
    processing: true,
    fileName,
    totalPages,
    totalChars,
    chunksToProcess: chunks.length,
    estimatedMinutes: estMinutes,
    message: `Procesare în curs — ${totalPages} pagini, ~${estMinutes} ${estMinutes === 1 ? "minut" : "minute"}. Secțiunile vor apărea automat.`,
  });
});

// ─── DELETE /knowledge/upload/:fileName — Delete all entries from a specific upload ───
configRoutes.delete("/knowledge/upload/:fileName", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const fileName = decodeURIComponent(c.req.param("fileName"));
  const sourceTag = `upload:${fileName}`;

  await db.delete(solomonKnowledge).where(
    and(
      eq(solomonKnowledge.organizationId, auth.organizationId),
      eq(solomonKnowledge.sourceReference, sourceTag),
    ),
  );

  return c.json({ ok: true });
});

// ─── GET /knowledge/uploads — List uploaded documents (grouped by source) ───
configRoutes.get("/knowledge/uploads", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  const entries = await db.query.solomonKnowledge.findMany({
    where: and(
      eq(solomonKnowledge.organizationId, auth.organizationId),
    ),
    orderBy: (k, { desc }) => [desc(k.createdAt)],
  });

  // Group by sourceReference that starts with "upload:"
  const uploads = new Map<string, { fileName: string; sections: number; createdAt: Date }>();
  for (const entry of entries) {
    if (entry.sourceReference?.startsWith("upload:")) {
      const fileName = entry.sourceReference.slice(7);
      const existing = uploads.get(fileName);
      if (!existing) {
        uploads.set(fileName, { fileName, sections: 1, createdAt: entry.createdAt });
      } else {
        existing.sections++;
      }
    }
  }

  return c.json(Array.from(uploads.values()));
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
  numberFormat: z.enum(["ro", "en"]).optional(),
  draftWatermark: z.boolean().optional(),
  draftWatermarkText: z.string().max(50).optional(),
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

// ============================================================
// REFERENCE VALUES — dynamic calculation parameters
// ============================================================

// --- GET all reference values (merged: org overrides + defaults) ---
configRoutes.get("/reference-values", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);

  // Load org-level overrides
  const overrides = await db.query.referenceValues.findMany({
    where: eq(referenceValues.organizationId, auth.organizationId),
  });
  const overrideMap = new Map(overrides.map(o => [o.key, { value: o.value, updatedAt: o.updatedAt }]));

  // Merge with defaults
  const merged = DEFAULT_REFERENCE_VALUES.map(def => {
    const override = overrideMap.get(def.key);
    return {
      key: def.key,
      label: def.label,
      group: def.group,
      dataType: def.dataType,
      unit: def.unit || null,
      description: def.description || null,
      defaultValue: def.defaultValue,
      value: override ? override.value : def.defaultValue,
      isOverridden: !!override,
      updatedAt: override?.updatedAt || null,
      usedInCalculations: def.usedInCalculations || false,
    };
  });

  // Add any custom values not in defaults
  for (const ov of overrides) {
    if (!DEFAULT_REFERENCE_VALUES.find(d => d.key === ov.key)) {
      merged.push({
        key: ov.key,
        label: ov.key,
        group: "custom",
        dataType: "text",
        unit: null,
        description: null,
        defaultValue: "",
        value: ov.value,
        isOverridden: true,
        updatedAt: ov.updatedAt,
        usedInCalculations: false,
      });
    }
  }

  return c.json({ values: merged, groups: Object.entries(
    await import("@dosarfonduri/shared").then(m => m.REFERENCE_VALUE_GROUPS)
  ).map(([k, v]) => ({ key: k, ...v })).sort((a, b) => a.order - b.order) });
});

// --- PUT a single reference value (upsert) ---
configRoutes.put("/reference-values", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);
  if (auth.role !== "admin" && auth.role !== "consultant") return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json();
  const schema = z.object({
    key: z.string().min(1).max(100),
    value: z.string().max(255),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Date invalide" }, 400);

  const existing = await db.query.referenceValues.findFirst({
    where: and(
      eq(referenceValues.organizationId, auth.organizationId),
      eq(referenceValues.key, parsed.data.key),
    ),
  });

  if (existing) {
    await db.update(referenceValues).set({
      value: parsed.data.value,
      updatedBy: auth.userId,
      updatedAt: new Date(),
    }).where(eq(referenceValues.id, existing.id));
  } else {
    await db.insert(referenceValues).values({
      organizationId: auth.organizationId,
      key: parsed.data.key,
      value: parsed.data.value,
      updatedBy: auth.userId,
    });
  }

  return c.json({ ok: true });
});

// --- DELETE a reference value override (revert to default) ---
configRoutes.delete("/reference-values/:key", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 400);
  if (auth.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const key = c.req.param("key");
  await db.delete(referenceValues).where(
    and(
      eq(referenceValues.organizationId, auth.organizationId),
      eq(referenceValues.key, key),
    ),
  );

  return c.json({ ok: true });
});

// --- Helper: get reference values as a flat number map (for calculations) ---
export async function getReferenceValuesMap(organizationId: string): Promise<Record<string, number>> {
  const overrides = await db.query.referenceValues.findMany({
    where: eq(referenceValues.organizationId, organizationId),
  });
  const overrideMap = new Map(overrides.map(o => [o.key, o.value]));

  const result: Record<string, number> = {};
  for (const def of DEFAULT_REFERENCE_VALUES) {
    const val = overrideMap.get(def.key) || def.defaultValue;
    const num = parseFloat(val);
    if (!isNaN(num)) result[def.key] = num;
  }
  return result;
}

// ═══════════════════════════════════════════
// RAG v2 — Knowledge Base (cabinet-level documents for Solomon)
// ═══════════════════════════════════════════

import { documentChapters, documentBriefs } from "../db/schema";
import { ingestDocumentQueue, JOB_PRIORITY } from "../lib/queue";
import { isRedisReady } from "../lib/redis";

/**
 * GET /api/config/knowledge-base
 * List knowledge base documents (RAG v2 chunks) for the cabinet.
 */
configRoutes.get("/knowledge-base", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const { documents } = await import("../db/schema");

  // Find documents that have been ingested as knowledge_base
  const kbDocs = await db.execute(
    sql`SELECT d.id, d.name, d.file_type, d.file_size, d.status, d.classification, d.uploaded_at,
        (SELECT COUNT(*) FROM document_chapters dc WHERE dc.document_id = d.id) as chapters_count
      FROM documents d
      WHERE d.organization_id = ${auth.organizationId}
        AND d.classification->>'routingAction' = 'vectorize'
        AND (d.classification->>'sourceType' = 'knowledge_base' OR d.processing_type = 'referinta_strategica')
      ORDER BY d.uploaded_at DESC`
  );

  const rows = (kbDocs as any).rows || kbDocs;
  return c.json(rows);
});

/**
 * POST /api/config/knowledge-base/upload
 * Upload a document to the cabinet knowledge base.
 * Uses the same ingestion pipeline but with sourceType=knowledge_base.
 */
configRoutes.post("/knowledge-base/upload", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const { documents, documentFolders, files } = await import("../db/schema");
  const { uploadFile } = await import("../services/storage");

  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  if (!file) return c.json({ error: "Fișier lipsă" }, 400);

  const buffer = Buffer.from(await file.arrayBuffer());

  // Find or create a knowledge base folder for this org
  let kbFolder = await db.query.documentFolders.findFirst({
    where: and(
      eq(documentFolders.organizationId, auth.organizationId),
      eq(documentFolders.type, "referinte" as any),
    ),
  });

  if (!kbFolder) {
    const [created] = await db.insert(documentFolders).values({
      organizationId: auth.organizationId,
      name: "Bază de cunoștințe",
      type: "referinte" as any,
      position: 99,
    }).returning();
    kbFolder = created;
  }

  // Upload file
  const fileId = await uploadFile(buffer, file.name, file.type, auth.organizationId, auth.userId, "knowledge");

  // Create document record
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const [doc] = await db.insert(documents).values({
    folderId: kbFolder.id,
    organizationId: auth.organizationId,
    name: file.name.replace(/\.[^.]+$/, ""),
    fileType: (ext === "docx" ? "docx" : ext === "xlsx" ? "xlsx" : "pdf") as any,
    mimeType: file.type || `application/${ext}`,
    fileId,
    fileSize: buffer.length,
    status: "uploaded",
    processingType: "referinta_strategica" as any,
    classification: {
      docType: "knowledge" as any,
      routingAction: "vectorize",
      confidence: 1.0,
      description: file.name,
      isProcessed: false,
    } as any,
    uploadedBy: auth.userId,
  }).returning();

  // Trigger ingestion pipeline with knowledge_base sourceType
  if (isRedisReady()) {
    try {
      await ingestDocumentQueue.add("ingest-document", {
        documentId: doc.id,
        cabinetId: auth.organizationId,
        sessionId: kbFolder.id,
        organizationId: auth.organizationId,
      }, {
        priority: JOB_PRIORITY.INGEST,
        jobId: `kb-${doc.id}`,
      });
    } catch (err: any) {
      console.warn("[config] KB ingest dispatch failed:", err.message);
    }
  }

  return c.json({ document: doc }, 201);
});

/**
 * DELETE /api/config/knowledge-base/:docId
 * Delete a knowledge base document and its chunks.
 */
configRoutes.delete("/knowledge-base/:docId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const docId = c.req.param("docId");
  const { documents } = await import("../db/schema");

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.organizationId, auth.organizationId)),
  });
  if (!doc) return c.json({ error: "Document not found" }, 404);

  // Delete chapters and briefs first (CASCADE would handle this, but explicit is cleaner)
  await db.delete(documentChapters).where(eq(documentChapters.documentId, docId));
  await db.delete(documentBriefs).where(eq(documentBriefs.documentId, docId));

  // Delete document
  await db.delete(documents).where(eq(documents.id, docId));

  return c.json({ ok: true });
});
