import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { createHash } from "crypto";
import { db } from "../db";
import { solomonConversations, solomonMessages, projects, documents, documentFolders } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";
import { processSolomonMessage, processInlineRefine, generateSolomonGreeting } from "../services/solomon";
import { uploadFile } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX, extractTextFromImage } from "../services/ocr";
import { processClientDocQueue, JOB_PRIORITY } from "../lib/queue";
import { publishUploadEvent } from "../lib/sse";
import { orgConfig } from "../db/schema";

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
  const convId = c.req.param("convId");

  const conv = await verifyConversationOrg(convId, auth.organizationId!);
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const { content, useET } = await c.req.json();

  const stream = await processSolomonMessage({
    conversationId: convId,
    projectId: conv.projectId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
    content,
    useETOverride: typeof useET === "boolean" ? useET : undefined,
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
  const convId = c.req.param("convId");

  const conv = await verifyConversationOrg(convId, auth.organizationId!);
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  const message = (formData.get("message") as string) || "";

  if (!file) return c.json({ error: "Fișier lipsă" }, 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileId = await uploadFile(buffer, file.name, file.type, auth.organizationId!, auth.userId, "client-docs");

  // Extract text based on file type (for Solomon's immediate use)
  // FIX F4.2: Wrap extraction in try-catch so corrupt files don't crash the stream
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

  // --- Create document record in Clienți Finali folder (linked to project) ---
  // This makes the document visible in the Documents tree automatically.
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, conv.projectId),
  });

  let documentId: string | null = null;
  if (project?.folderId) {
    // Project's folderId should point to a clienti_finali folder (or we find it)
    let targetFolderId = project.folderId;

    // Verify it's a clienti_finali folder; if not, look for one as a sibling
    const projFolder = await db.query.documentFolders.findFirst({
      where: eq(documentFolders.id, project.folderId),
    });
    if (projFolder && projFolder.type !== "clienti_finali") {
      // Walk up to find the sesiune parent, then find clienti_finali child
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

    // Detect file type from MIME / extension
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const MIME_TO_TYPE: Record<string, string> = {
      "application/pdf": "pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
      "application/msword": "doc",
      "image/png": "png",
      "image/jpeg": "jpg",
    };
    const EXT_TO_TYPE: Record<string, string> = { pdf: "pdf", docx: "docx", xlsx: "xlsx", doc: "doc", png: "png", jpg: "jpg", jpeg: "jpg" };
    const fileType = MIME_TO_TYPE[file.type] || EXT_TO_TYPE[ext] || "pdf";

    // Sanitize filename
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

      // Queue processClientDoc for proper extraction + cascade validation
      await processClientDocQueue.add("process-client-doc", {
        documentId: doc.id,
        organizationId: auth.organizationId!,
      }, { priority: JOB_PRIORITY.CLIENT_DOC }).catch((err: any) => {
        console.error(`Queue dispatch failed for Solomon upload ${doc.id}:`, err.message);
        // Mark document back to uploaded so it can be retried
        db.update(documents).set({ status: "uploaded" }).where(eq(documents.id, doc.id)).catch(() => {});
      });

      // SSE notification so Documents page updates in real-time
      publishUploadEvent(auth.organizationId!, {
        documentId: doc.id,
        documentName: safeName,
        status: "processing",
        processingType: "client_doc",
        message: `Document uploadat prin Solomon: "${file.name}", procesare în curs...`,
      }).catch(() => {});
    } catch (err) {
      console.error("Failed to create document record for Solomon upload:", err);
      // Non-blocking: Solomon chat continues even if document record fails
    }
  }

  // Solomon processes the file immediately (text-based) in parallel with processClientDoc
  const stream = await processSolomonMessage({
    conversationId: convId,
    projectId: conv.projectId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
    content: message || `Am uploadat documentul "${file.name}". Extrage informațiile relevante.`,
    attachments: [{
      fileId,
      fileName: file.name,
      mimeType: file.type,
      extractedText,
      documentId: documentId || undefined,
    }],
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
  const convId = c.req.param("convId");

  const conv = await verifyConversationOrg(convId, auth.organizationId!);
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const { selectedText, instruction } = await c.req.json();
  if (!selectedText || !instruction) return c.json({ error: "selectedText and instruction required" }, 400);

  const stream = await processInlineRefine({
    conversationId: convId,
    projectId: conv.projectId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
    selectedText,
    instruction,
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
  const { model } = await c.req.json();

  const validModels = ["claude-sonnet-4-20250514", "claude-opus-4-6"];
  if (!validModels.includes(model)) return c.json({ error: "Model invalid" }, 400);

  const conv = await verifyConversationOrg(convId, auth.organizationId!);
  if (!conv) return c.json({ error: "Conversation not found" }, 404);

  const [updated] = await db.update(solomonConversations)
    .set({ model })
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
