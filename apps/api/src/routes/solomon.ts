import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { createHash } from "crypto";
import { db } from "../db";
import { solomonConversations, solomonMessages, projects, documents, documentFolders, solomonEligibility, solomonScoring, projectChecklist } from "../db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";
import { processSolomonMessage, processInlineRefine, generateSolomonGreeting } from "../services/solomon";
import { uploadFile } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX, extractTextFromImage } from "../services/ocr";
import { processClientDocQueue, JOB_PRIORITY } from "../lib/queue";
import { publishUploadEvent } from "../lib/sse";
import { orgConfig } from "../db/schema";
import { sendMessageSchema, refineSchema, updateModelSchema } from "@dosarfonduri/shared";

export const solomonRoutes = new Hono<AppEnv>();

// Helper: verify project belongs to the user's organization
async function verifyProjectOrg(projectId: string, organizationId: string) {
  return db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)),
  });
}

// Helper: verify conversation belongs to the user's organization (via project)
async function verifyConversationOrg(convId: string, organizationId: string) {
  const conv = await db.query.solomonConversations.findFirst({
    where: eq(solomonConversations.id, convId),
  });
  if (!conv) return null;
  const project = await verifyProjectOrg(conv.projectId, organizationId);
  if (!project) return null;
  return conv;
}

// Create conversation
solomonRoutes.post("/projects/:projectId/conversations", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const config = await db.query.orgConfig.findFirst({
    where: (cfg, { eq }) => eq(cfg.organizationId, auth.organizationId!),
  });

  const [conv] = await db.insert(solomonConversations).values({
    projectId,
    userId: auth.userId,
    model: config?.solomonModel || "claude-opus-4-6",
  }).returning();

  // Generate auto-greeting with program context detection
  let greeting: string | null = null;
  try {
    greeting = await generateSolomonGreeting({
      conversationId: conv.id,
      projectId,
      organizationId: auth.organizationId!,
    });
  } catch (err) {
    console.error("Failed to generate Solomon greeting:", err);
  }

  return c.json({ ...conv, greeting }, 201);
});

// List conversations
solomonRoutes.get("/projects/:projectId/conversations", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const convs = await db.query.solomonConversations.findMany({
    where: eq(solomonConversations.projectId, projectId),
    orderBy: (c, { desc }) => [desc(c.createdAt)],
  });

  return c.json(convs);
});

// Send message (SSE streaming)
solomonRoutes.post("/conversations/:convId/messages", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
  const convId = c.req.param("convId");

  const conv = await verifyConversationOrg(convId, auth.organizationId!);
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const body = sendMessageSchema.parse(await c.req.json());

  const stream = await processSolomonMessage({
    conversationId: convId,
    projectId: conv.projectId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
    content: body.content,
    useETOverride: typeof body.useET === "boolean" ? body.useET : undefined,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

// Upload document in conversation
solomonRoutes.post("/conversations/:convId/upload", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
  const convId = c.req.param("convId");

  const conv = await verifyConversationOrg(convId, auth.organizationId!);
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const formData = await c.req.formData();
  const message = (formData.get("message") as string) || "";

  // Support both single file ("file") and multiple files ("files") for backwards compatibility
  const rawFiles = formData.getAll("files") as File[];
  const legacySingle = formData.get("file") as File | null;
  const files: File[] = rawFiles.length > 0 ? rawFiles : (legacySingle ? [legacySingle] : []);

  if (files.length === 0) return c.json({ error: "Fișier lipsă" }, 400);
  if (files.length > 10) return c.json({ error: "Maximum 10 fișiere per upload" }, 400);

  // --- Process each file: upload, extract text, create document record ---
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, conv.projectId),
  });

  // Find target folder once for all files
  let targetFolderId: string | null = null;
  if (project?.folderId) {
    targetFolderId = project.folderId;
    const projFolder = await db.query.documentFolders.findFirst({
      where: eq(documentFolders.id, project.folderId),
    });
    if (projFolder && projFolder.type !== "clienti_finali") {
      const parentId = projFolder.parentId;
      if (parentId) {
        const clientiFolder = await db.query.documentFolders.findFirst({
          where: and(
            eq(documentFolders.parentId, parentId),
            eq(documentFolders.type, "clienti_finali"),
            eq(documentFolders.organizationId, auth.organizationId!),
          ),
        });
        if (clientiFolder) targetFolderId = clientiFolder.id;
      }
    }
  }

  const MIME_TO_TYPE: Record<string, string> = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/msword": "doc",
    "image/png": "png",
    "image/jpeg": "jpg",
  };
  const EXT_TO_TYPE: Record<string, string> = { pdf: "pdf", docx: "docx", xlsx: "xlsx", doc: "doc", png: "png", jpg: "jpg", jpeg: "jpg" };

  const attachments: Array<{ fileId: string; fileName: string; mimeType: string; extractedText?: string; documentId?: string }> = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileId = await uploadFile(buffer, file.name, file.type, auth.organizationId!, auth.userId, "client-docs");

    // Extract text based on file type (for Solomon's immediate use)
    let extractedText = "";
    const isImage = /^image\/(png|jpe?g)$/i.test(file.type) || /\.(png|jpe?g)$/i.test(file.name);
    try {
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        extractedText = (await extractTextFromPDF(buffer)).text;
      } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.name.endsWith(".docx")) {
        extractedText = await extractTextFromDOCX(buffer, file.name);
      } else if (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.name.endsWith(".xlsx")) {
        extractedText = await extractTextFromXLSX(buffer, file.name);
      } else if (isImage) {
        extractedText = await extractTextFromImage(buffer, file.name);
      }
    } catch (extractErr) {
      console.warn(`[solomon upload] File extraction failed for "${file.name}":`, (extractErr as Error).message);
      extractedText = `[Fișier neprelucrabil: ${file.name}]`;
    }

    // Create document record in Clienți Finali folder
    let documentId: string | undefined;
    if (targetFolderId) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const fileType = MIME_TO_TYPE[file.type] || EXT_TO_TYPE[ext] || "pdf";

      const rawName = file.name.replace(/\.[^.]+$/, "");
      const safeName = rawName
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[ăâ]/gi, "a").replace(/[îì]/gi, "i")
        .replace(/[șş]/gi, "s").replace(/[țţ]/gi, "t")
        .replace(/[^a-zA-Z0-9._\-\s]/g, "_")
        .replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || rawName;

      const hash = createHash("sha256").update(buffer).digest("hex");

      try {
        const [doc] = await db.insert(documents).values({
          folderId: targetFolderId,
          organizationId: auth.organizationId!,
          name: safeName,
          fileType: fileType as any,
          mimeType: file.type || `application/${ext}`,
          fileId,
          fileSize: buffer.length,
          fileHash: hash,
          status: "processing",
          processingType: "client_doc",
          tags: ["solomon_upload"],
          uploadedBy: auth.userId,
        }).returning();

        documentId = doc.id;

        await processClientDocQueue.add("process-client-doc", {
          documentId: doc.id,
          organizationId: auth.organizationId!,
        }, { priority: JOB_PRIORITY.CLIENT_DOC }).catch((err: any) => {
          console.error(`Queue dispatch failed for Solomon upload ${doc.id}:`, err.message);
          db.update(documents).set({ status: "uploaded" }).where(eq(documents.id, doc.id)).catch((e: any) => console.warn("[solomon] doc status rollback:", e.message));
        });

        publishUploadEvent(auth.organizationId!, {
          documentId: doc.id,
          documentName: safeName,
          status: "processing",
          processingType: "client_doc",
          message: `Document uploadat prin Solomon: "${file.name}", procesare în curs...`,
        }).catch((e: any) => console.warn("[solomon] SSE upload event:", e.message));
      } catch (err) {
        console.error("Failed to create document record for Solomon upload:", err);
      }
    }

    attachments.push({
      fileId,
      fileName: file.name,
      mimeType: file.type,
      extractedText,
      documentId,
    });
  }

  // Build content message describing all uploaded files
  const fileNames = files.map(f => f.name).join(", ");
  const defaultMessage = files.length > 1
    ? `Am uploadat ${files.length} documente: ${fileNames}. Analizează-le pe toate, extrage informațiile relevante pentru completarea cererii de finanțare și propune-le ca elemente de confirmat. Dacă sunt oferte de preț, compară-le și extrage datele structurate (furnizor, echipamente, prețuri, valabilitate).`
    : `Am uploadat documentul "${files[0].name}" pentru dosarul de finanțare. Extrage toate informațiile relevante pentru completarea cererii de finanțare și propune-le ca elemente de confirmat.`;

  // Solomon processes all files immediately (text-based) in parallel with processClientDoc jobs
  const stream = await processSolomonMessage({
    conversationId: convId,
    projectId: conv.projectId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
    content: message || defaultMessage,
    attachments,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

// Inline refine (rewrite selected text)
solomonRoutes.post("/conversations/:convId/refine", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.userId) return c.json({ error: "Unauthorized" }, 401);
  const convId = c.req.param("convId");

  const conv = await verifyConversationOrg(convId, auth.organizationId!);
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const body = refineSchema.parse(await c.req.json());

  const stream = await processInlineRefine({
    conversationId: convId,
    projectId: conv.projectId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
    selectedText: body.selectedText,
    instruction: body.instruction,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

// Switch model for conversation
solomonRoutes.put("/conversations/:convId/model", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const convId = c.req.param("convId");
  const body = updateModelSchema.parse(await c.req.json());

  const validModels = ["claude-sonnet-4-6", "claude-opus-4-6"];
  if (!validModels.includes(body.model)) return c.json({ error: "Model invalid" }, 400);

  const conv = await verifyConversationOrg(convId, auth.organizationId!);
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const [updated] = await db.update(solomonConversations)
    .set({ model: body.model })
    .where(eq(solomonConversations.id, convId))
    .returning();

  return c.json(updated);
});

// Message history
solomonRoutes.get("/conversations/:convId/messages", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const convId = c.req.param("convId");

  const conv = await verifyConversationOrg(convId, auth.organizationId!);
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const messages = await db.query.solomonMessages.findMany({
    where: eq(solomonMessages.conversationId, convId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });

  return c.json(messages);
});

// ═══════════════════════════════════════════
// RAG v2 — Phase endpoint + Compose brief
// ═══════════════════════════════════════════

/**
 * GET /api/solomon/projects/:projectId/phase
 * Returns current Solomon phase for the project.
 */
solomonRoutes.get("/projects/:projectId/phase", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  return c.json({ phase: project.solomonPhase || null });
});

/**
 * POST /api/solomon/projects/:projectId/compose-brief
 * Generate a structured brief from Solomon conversation for Neemia compose.
 */
solomonRoutes.post("/projects/:projectId/compose-brief", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  // Load project elements
  const { projectElements } = await import("../db/schema");
  const elements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  // Load recent Solomon messages
  const conversations = await db.query.solomonConversations.findMany({
    where: eq(solomonConversations.projectId, projectId),
    orderBy: (c, { desc }) => [desc(c.createdAt)],
    limit: 1,
  });

  let recentMessages: string[] = [];
  if (conversations.length > 0) {
    const msgs = await db.query.solomonMessages.findMany({
      where: eq(solomonMessages.conversationId, conversations[0].id),
      orderBy: (m, { desc }) => [desc(m.createdAt)],
      limit: 20,
    });
    recentMessages = msgs.reverse().map(m => `${m.role}: ${m.content?.slice(0, 500)}`);
  }

  // Generate brief using Anthropic (Opus, short call)
  const { anthropic, withAILimit } = await import("../lib/anthropic");
  const phase = project.solomonPhase as any;

  const briefResponse = await withAILimit(async () => {
    return anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2000,
      system: "Ești Solomon, consultant senior fonduri europene. Generează un brief structurat și concis pe baza datelor colectate. Răspunde DOAR cu JSON valid.",
      messages: [{
        role: "user",
        content: `Proiect: ${project.name}
Faza curentă: ${phase?.phase || "necunoscută"} (${phase?.label || ""})
Progres: ${phase?.progress || 0}%

Elemente colectate (${elements.length}):
${elements.filter(e => e.value).slice(0, 50).map(e => `- ${e.value}`).join("\n")}

Ultimele mesaje conversație:
${recentMessages.slice(-10).join("\n")}

Generează brief JSON:
{
  "narrativeThread": "motivația centrală a investiției (2-3 propoziții)",
  "clientProfile": { "type": "...", "experience": "...", "currentAssets": "..." },
  "investmentDescription": { "summary": "...", "objectives": ["..."], "justification": "..." },
  "eligibilityConclusions": { "status": "eligibil/eligibil cu observații/neeligibil", "keyFindings": ["..."], "risks": ["..."] },
  "scoringEstimate": { "totalPoints": 0, "keyFactors": ["..."], "threshold": "..." },
  "strategicArguments": ["argument 1", "argument 2", "..."],
  "generatedAt": "${new Date().toISOString()}"
}`,
      }],
    });
  }, "batch");

  const text = briefResponse.content[0].type === "text" ? briefResponse.content[0].text : "{}";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const brief = JSON.parse(cleaned);
    brief.generatedAt = new Date().toISOString();

    await db.update(projects)
      .set({ composeBrief: brief })
      .where(eq(projects.id, projectId));

    return c.json({ brief });
  } catch {
    return c.json({ error: "Failed to generate compose brief" }, 500);
  }
});

// ═══════════════════════════════════════════
// Sprint 5 — Structured output endpoints
// ═══════════════════════════════════════════

/**
 * GET /api/solomon/projects/:projectId/eligibility
 * Returns Solomon's eligibility conclusions.
 */
solomonRoutes.get("/projects/:projectId/eligibility", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const entries = await db.query.solomonEligibility.findMany({
    where: eq(solomonEligibility.projectId, projectId),
    orderBy: (e, { asc }) => [asc(e.createdAt)],
  });

  const passed = entries.filter(e => e.status === "pass").length;
  const failed = entries.filter(e => e.status === "fail").length;
  const pending = entries.filter(e => e.status === "pending").length;

  return c.json({
    entries,
    summary: { total: entries.length, passed, failed, pending },
  });
});

/**
 * GET /api/solomon/projects/:projectId/scoring
 * Returns Solomon's scoring estimates.
 */
solomonRoutes.get("/projects/:projectId/scoring", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const entries = await db.query.solomonScoring.findMany({
    where: eq(solomonScoring.projectId, projectId),
    orderBy: (e, { desc: d }) => [d(e.pointsEstimated)],
  });

  const totalEstimated = entries.reduce((s, e) => s + (e.pointsEstimated || 0), 0);
  const totalMax = entries.reduce((s, e) => s + (e.maxPoints || 0), 0);

  return c.json({
    criteria: entries,
    totalEstimated,
    totalMax,
  });
});

/**
 * GET /api/solomon/projects/:projectId/document-checklist
 * Returns Solomon-generated document checklist with upload matching.
 */
solomonRoutes.get("/projects/:projectId/document-checklist", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const items = await db.query.projectChecklist.findMany({
    where: and(eq(projectChecklist.projectId, projectId), eq(projectChecklist.source, "solomon")),
    orderBy: (c, { asc }) => [asc(c.sortOrder), asc(c.createdAt)],
  });

  const uploaded = items.filter(i => i.done).length;

  return c.json({
    items,
    summary: { total: items.length, uploaded, missing: items.length - uploaded },
  });
});
