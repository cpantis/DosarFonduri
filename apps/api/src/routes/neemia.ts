import { Hono } from "hono";
import { db } from "../db";
import { projectDocuments, documents } from "../db/schema";
import { eq } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";
import { generateDocument, validateBeforeGenerate } from "../services/neemia";
import { getFileUrl } from "../services/storage";

export const neemiaRoutes = new Hono();

// Validate before generation
neemiaRoutes.post("/projects/:projectId/validate", async (c) => {
  const projectId = c.req.param("projectId");
  const { templateDocumentId } = await c.req.json();

  const result = await validateBeforeGenerate(projectId, templateDocumentId);
  return c.json(result);
});

// Generate document (SSE streaming)
neemiaRoutes.post("/projects/:projectId/generate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");
  const { templateDocumentId } = await c.req.json();

  const stream = await generateDocument({
    projectId,
    templateDocumentId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

// List generated documents per project
neemiaRoutes.get("/projects/:projectId/documents", async (c) => {
  const projectId = c.req.param("projectId");

  const docs = await db.query.projectDocuments.findMany({
    where: eq(projectDocuments.projectId, projectId),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
  });

  const enriched = await Promise.all(docs.map(async (d) => {
    const templateDoc = await db.query.documents.findFirst({
      where: eq(documents.id, d.templateDocumentId),
    });
    const downloadUrl = d.generatedFileId ? await getFileUrl(d.generatedFileId) : null;

    return {
      ...d,
      templateName: templateDoc?.name || "Unknown",
      templateFileType: templateDoc?.fileType || "docx",
      downloadUrl,
    };
  }));

  return c.json(enriched);
});

// Download generated document
neemiaRoutes.get("/documents/:docId/download", async (c) => {
  const docId = c.req.param("docId");

  const projDoc = await db.query.projectDocuments.findFirst({
    where: eq(projectDocuments.id, docId),
  });
  if (!projDoc || !projDoc.generatedFileId) return c.json({ error: "Not found" }, 404);

  const url = await getFileUrl(projDoc.generatedFileId);
  return c.json({ downloadUrl: url });
});

// Validate document by consultant
neemiaRoutes.put("/documents/:docId/validate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");

  const [updated] = await db.update(projectDocuments).set({
    status: "validated",
    validatedBy: auth.userId,
  }).where(eq(projectDocuments.id, docId)).returning();

  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

// Regenerate document
neemiaRoutes.post("/documents/:docId/regenerate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");

  const projDoc = await db.query.projectDocuments.findFirst({
    where: eq(projectDocuments.id, docId),
  });
  if (!projDoc) return c.json({ error: "Not found" }, 404);

  const stream = await generateDocument({
    projectId: projDoc.projectId,
    templateDocumentId: projDoc.templateDocumentId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
