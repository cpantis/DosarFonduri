import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { db } from "../db";
import { solomonConversations, solomonMessages, projects } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";
import { processSolomonMessage, processInlineRefine, generateSolomonGreeting } from "../services/solomon";
import { uploadFile } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX } from "../services/ocr";
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
  const fileId = await uploadFile(buffer, file.name, file.type, auth.organizationId!, auth.userId);

  // Extract text based on file type
  let extractedText = "";
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    extractedText = await extractTextFromPDF(buffer);
  } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.name.endsWith(".docx")) {
    extractedText = await extractTextFromDOCX(buffer, file.name);
  } else if (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.name.endsWith(".xlsx")) {
    extractedText = await extractTextFromXLSX(buffer, file.name);
  }

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
