import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { db } from "../db";
import { projectDocuments, documents, templateElements, projectElements, guideReferenceTables } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";
import {
  generateDocument, validateBeforeGenerate,
  checkCrossDocumentConsistency, computeCalculatedFields,
  generateAllDocuments,
} from "../services/neemia";
import {
  composeDocument, validateComposeReadiness, buildComposeContext,
} from "../services/neemiaCompose";
import { getFileUrl } from "../services/storage";

export const neemiaRoutes = new Hono<AppEnv>();

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

// Regenerate document (creates new version, keeps history)
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

// Version history for a template document
neemiaRoutes.get("/projects/:projectId/documents/:templateDocId/versions", async (c) => {
  const projectId = c.req.param("projectId");
  const templateDocId = c.req.param("templateDocId");

  const versions = await db.query.projectDocuments.findMany({
    where: and(
      eq(projectDocuments.projectId, projectId),
      eq(projectDocuments.templateDocumentId, templateDocId),
    ),
    orderBy: (d, { desc }) => [desc(d.version)],
  });

  const enriched = await Promise.all(versions.map(async (v) => {
    const downloadUrl = v.generatedFileId ? await getFileUrl(v.generatedFileId) : null;
    return { ...v, downloadUrl };
  }));

  return c.json(enriched);
});

// Cross-document consistency check
neemiaRoutes.get("/projects/:projectId/consistency", async (c) => {
  const projectId = c.req.param("projectId");
  const result = await checkCrossDocumentConsistency(projectId);
  return c.json(result);
});

// Compute calculated fields
neemiaRoutes.post("/projects/:projectId/calculate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");
  const results = await computeCalculatedFields(projectId, auth.organizationId!);
  return c.json(results);
});

// Get template pages with filled elements — for document preview
neemiaRoutes.get("/projects/:projectId/template-pages/:templateDocId", async (c) => {
  const projectId = c.req.param("projectId");
  const templateDocId = c.req.param("templateDocId");

  const templateDoc = await db.query.documents.findFirst({
    where: eq(documents.id, templateDocId),
  });
  if (!templateDoc) return c.json({ error: "Template not found" }, 404);

  const tmplEls = await db.query.templateElements.findMany({
    where: eq(templateElements.documentId, templateDocId),
  });

  const projEls = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  // Group by page
  const pageMap = new Map<number, Array<{
    key: string;
    label: string;
    fieldType: string;
    lineNum: number | null;
    group: string | null;
    value: string | null;
    source: string | null;
    confirmed: boolean;
    templateElementId: string;
  }>>();

  for (const te of tmplEls) {
    const pageNum = te.pageNum || 1;
    const pe = projEls.find(p => p.templateElementId === te.id);

    const field = {
      key: te.key,
      label: te.label,
      fieldType: te.fieldType,
      lineNum: te.lineNum,
      group: te.group,
      value: pe?.value || null,
      source: pe?.source || null,
      confirmed: pe?.confirmed ?? false,
      templateElementId: te.id,
    };

    const existing = pageMap.get(pageNum) || [];
    existing.push(field);
    pageMap.set(pageNum, existing);
  }

  // Sort pages and fields within pages
  const pages = [...pageMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([num, fields]) => {
      fields.sort((a, b) => (a.lineNum || 0) - (b.lineNum || 0));
      const filled = fields.filter(f => f.value && f.value.trim() !== "").length;
      const confirmed = fields.filter(f => f.confirmed).length;
      return {
        num,
        fields,
        totalFields: fields.length,
        filledFields: filled,
        confirmedFields: confirmed,
        status: filled === fields.length ? "complete" : filled > 0 ? "partial" : "empty",
      };
    });

  const totalFields = tmplEls.length;
  const filledFields = pages.reduce((sum, p) => sum + p.filledFields, 0);
  const confirmedFields = pages.reduce((sum, p) => sum + p.confirmedFields, 0);

  return c.json({
    templateName: templateDoc.name,
    templateFileType: templateDoc.fileType,
    totalPages: pages.length,
    totalFields,
    filledFields,
    confirmedFields,
    pages,
  });
});

// Bulk generate all documents
neemiaRoutes.post("/projects/:projectId/generate-all", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const stream = await generateAllDocuments({
    projectId,
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

// ═══ COMPOSE MODE ROUTES ═══

// Validate COMPOSE readiness
neemiaRoutes.post("/projects/:projectId/compose/validate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");
  const { templateDocumentId } = await c.req.json();

  const result = await validateComposeReadiness(projectId, templateDocumentId, auth.organizationId!);
  return c.json(result);
});

// Preview COMPOSE content (AI generates, no DOCX yet)
neemiaRoutes.post("/projects/:projectId/compose/preview", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");
  const { templateDocumentId } = await c.req.json();

  const stream = await composeDocument({
    projectId,
    templateDocumentId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
    previewOnly: true,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

// Generate COMPOSE document (full DOCX with AI content + tables)
neemiaRoutes.post("/projects/:projectId/compose/generate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");
  const { templateDocumentId, editedSections } = await c.req.json();

  const stream = await composeDocument({
    projectId,
    templateDocumentId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
    previewOnly: false,
    editedSections,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

// Get COMPOSE context data (elements + reference tables + rules)
neemiaRoutes.get("/projects/:projectId/compose/context/:templateDocId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");
  const templateDocId = c.req.param("templateDocId");

  const context = await buildComposeContext(projectId, auth.organizationId!, templateDocId);
  return c.json(context);
});

// ═══ COMPOSE CONFIG ADMIN ROUTES ═══

// Get document generation mode + composeConfig
neemiaRoutes.get("/templates/:docId/compose-config", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Document not found" }, 404);

  return c.json({
    id: doc.id,
    name: doc.name,
    fileType: doc.fileType,
    generationMode: (doc as any).generationMode || "fill",
    composeConfig: (doc as any).composeConfig || null,
  });
});

// Set document generation mode (fill → compose or vice-versa)
neemiaRoutes.put("/templates/:docId/generation-mode", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");
  const { mode } = await c.req.json() as { mode: "fill" | "compose" };

  if (!["fill", "compose"].includes(mode)) {
    return c.json({ error: "Mode must be 'fill' or 'compose'" }, 400);
  }

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Document not found" }, 404);

  const [updated] = await db.update(documents).set({
    generationMode: mode,
  } as any).where(eq(documents.id, docId)).returning();

  return c.json({
    id: updated.id,
    name: updated.name,
    generationMode: (updated as any).generationMode,
  });
});

// Update composeConfig sections for a COMPOSE template
neemiaRoutes.put("/templates/:docId/compose-config", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");
  const body = await c.req.json() as {
    sections: Array<{
      marker: string;
      type: "narrative" | "table" | "calculation";
      label: string;
      referenceTableIds?: string[];
      elementKeys?: string[];
      instructions?: string;
    }>;
    aiModel?: string;
    language?: string;
  };

  // Validate sections
  if (!body.sections || !Array.isArray(body.sections)) {
    return c.json({ error: "sections array is required" }, 400);
  }

  for (const s of body.sections) {
    if (!s.marker || !s.type || !s.label) {
      return c.json({ error: "Each section needs marker, type, and label" }, 400);
    }
    if (!["narrative", "table", "calculation"].includes(s.type)) {
      return c.json({ error: `Invalid section type: ${s.type}` }, 400);
    }
  }

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Document not found" }, 404);

  // Auto-set mode to compose when config is set
  const [updated] = await db.update(documents).set({
    generationMode: "compose",
    composeConfig: {
      sections: body.sections,
      aiModel: body.aiModel,
      language: body.language || "ro",
    },
  } as any).where(eq(documents.id, docId)).returning();

  return c.json({
    id: updated.id,
    name: updated.name,
    generationMode: (updated as any).generationMode,
    composeConfig: (updated as any).composeConfig,
  });
});

// Auto-detect COMPOSE markers in a DOCX template
// Scans for {{COMPOSE:...}}, {{TABLE:...}}, {{CALC:...}} and returns suggested sections
neemiaRoutes.post("/templates/:docId/detect-compose-markers", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Document not found" }, 404);

  // Load template elements for this document
  const tmplEls = await db.query.templateElements.findMany({
    where: eq(templateElements.documentId, docId),
  });

  // Check for COMPOSE/TABLE/CALC markers among template element keys
  const composeMarkers: Array<{
    marker: string;
    type: "narrative" | "table" | "calculation";
    label: string;
  }> = [];

  const simpleKeys: string[] = [];

  for (const el of tmplEls) {
    if (el.key.startsWith("COMPOSE:")) {
      composeMarkers.push({
        marker: el.key,
        type: "narrative",
        label: el.label || el.key.replace("COMPOSE:", "").replace(/_/g, " "),
      });
    } else if (el.key.startsWith("TABLE:")) {
      composeMarkers.push({
        marker: el.key,
        type: "table",
        label: el.label || el.key.replace("TABLE:", "").replace(/_/g, " "),
      });
    } else if (el.key.startsWith("CALC:")) {
      composeMarkers.push({
        marker: el.key,
        type: "calculation",
        label: el.label || el.key.replace("CALC:", "").replace(/_/g, " "),
      });
    } else {
      simpleKeys.push(el.key);
    }
  }

  // Load available reference tables
  const refTables = await db.query.guideReferenceTables.findMany({
    where: eq(guideReferenceTables.organizationId, auth.organizationId!),
  });

  return c.json({
    documentId: docId,
    documentName: doc.name,
    composeMarkers,
    simpleKeys,
    availableReferenceTables: refTables.map(t => ({
      id: t.id,
      name: t.name,
      tableType: t.tableType,
      columnCount: (t.schema as any[])?.length || 0,
      rowCount: (t.data as any[])?.length || 0,
    })),
    suggestion: composeMarkers.length > 0
      ? "compose"
      : "fill",
  });
});
