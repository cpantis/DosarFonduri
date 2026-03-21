import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { db } from "../db";
import { projectDocuments, documents, templateElements, projectElements, guideReferenceTables, projects, composeSectionVersions, templatePlaceholderMapping, companies, companyFinancials, organizations } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";
import {
  generateDocument, validateBeforeGenerate,
  checkCrossDocumentConsistency, computeCalculatedFields,
  generateAllDocuments,
} from "../services/neemia";
import {
  renderDocument, getPageImage, cleanupRenderOutput,
  type KnownKey,
} from "../services/documentRenderer";
import {
  composeDocument, validateComposeReadiness, buildComposeContext,
} from "../services/neemiaCompose";
import { getFileUrl, getFileBuffer } from "../services/storage";
import {
  templateDocIdSchema, generationModeSchema, composeConfigSchema,
  updateSectionContentSchema, composeGenerateSchema,
} from "@dosarfonduri/shared";

export const neemiaRoutes = new Hono<AppEnv>();

/**
 * Build additional injected values that Neemia adds at generation time.
 * These are values that don't come from projectElements but are injected
 * from project metadata, company data, financials, and cabinet branding.
 * Both fill-preview and template-render must include these so the UI
 * matches what generateDocument will actually produce.
 */
async function buildInjectedValues(projectId: string, organizationId: string): Promise<Record<string, string>> {
  const injected: Record<string, string> = {};

  // 1. Project metadata
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (project?.programFinantare) injected["program_finantare"] = project.programFinantare;
  if (project?.codMasura) injected["cod_masura"] = project.codMasura;
  if (project?.codSesiune) injected["cod_sesiune"] = project.codSesiune;
  if (project?.codNomenclator) injected["cod_nomenclator"] = project.codNomenclator;
  if (project?.prefixDocumente) injected["prefix_documente"] = project.prefixDocumente;
  if (project?.codMysmis) injected["cod_mysmis"] = project.codMysmis;

  // 2. Company data
  if (project?.companyId) {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, project.companyId),
    });
    if (company?.denumire) injected["denumire_firma"] = company.denumire;
    if (company?.cui) injected["cui_firma"] = company.cui;

    // 3. Financial data (F10/F20 from latest year)
    const financials = await db.query.companyFinancials.findMany({
      where: eq(companyFinancials.companyId, project.companyId),
    });
    if (financials.length > 0) {
      const latest = financials.sort((a: any, b: any) => b.year - a.year)[0];
      const f10 = (latest as any).f10 as Record<string, any> || {};
      const f20 = (latest as any).f20 as Record<string, any> || {};
      for (const [key, value] of Object.entries({ ...f10, ...f20 })) {
        if (value != null && String(value).trim() !== "" && !injected[key]) {
          injected[key] = String(value);
        }
      }
    }
  }

  // 4. Cabinet branding
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  const cabinetStyle = (org as any)?.cabinetDocumentStyle || {};
  if (cabinetStyle.footerText) injected["footer_cabinet"] = cabinetStyle.footerText;

  return injected;
}

// Helper: verify project belongs to the user's organization
async function verifyProjectOrg(projectId: string, organizationId: string) {
  return db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)),
  });
}

// Helper: verify project document belongs to the user's organization (via project)
async function verifyProjectDocOrg(docId: string, organizationId: string) {
  const projDoc = await db.query.projectDocuments.findFirst({
    where: eq(projectDocuments.id, docId),
  });
  if (!projDoc) return null;
  const project = await verifyProjectOrg(projDoc.projectId, organizationId);
  if (!project) return null;
  return projDoc;
}

// Validate before generation
neemiaRoutes.post("/projects/:projectId/validate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const body = templateDocIdSchema.parse(await c.req.json());

  const result = await validateBeforeGenerate(projectId, body.templateDocumentId);
  return c.json(result);
});

// Generate document (SSE streaming)
neemiaRoutes.post("/projects/:projectId/generate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const body = templateDocIdSchema.parse(await c.req.json());

  const stream = await generateDocument({
    projectId,
    templateDocumentId: body.templateDocumentId,
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
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

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
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");

  const projDoc = await verifyProjectDocOrg(docId, auth.organizationId!);
  if (!projDoc || !projDoc.generatedFileId) return c.json({ error: "Not found" }, 404);

  const url = await getFileUrl(projDoc.generatedFileId);
  return c.json({ downloadUrl: url });
});

// Validate document by consultant
neemiaRoutes.put("/documents/:docId/validate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");

  const projDoc = await verifyProjectDocOrg(docId, auth.organizationId!);
  if (!projDoc) return c.json({ error: "Not found" }, 404);

  const [updated] = await db.update(projectDocuments).set({
    status: "validated",
    validatedBy: auth.userId,
  }).where(eq(projectDocuments.id, docId)).returning();

  return c.json(updated);
});

// Regenerate document (creates new version, keeps history)
neemiaRoutes.post("/documents/:docId/regenerate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");

  const projDoc = await verifyProjectDocOrg(docId, auth.organizationId!);
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
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

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
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const result = await checkCrossDocumentConsistency(projectId);
  return c.json(result);
});

// Compute calculated fields
neemiaRoutes.post("/projects/:projectId/calculate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const results = await computeCalculatedFields(projectId, auth.organizationId!);
  return c.json(results);
});

// Get template pages with filled elements — for document preview
neemiaRoutes.get("/projects/:projectId/template-pages/:templateDocId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

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

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

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

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const body = templateDocIdSchema.parse(await c.req.json());

  const result = await validateComposeReadiness(projectId, body.templateDocumentId, auth.organizationId!);
  return c.json(result);
});

// Preview COMPOSE content (AI generates, no DOCX yet)
neemiaRoutes.post("/projects/:projectId/compose/preview", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const body = await c.req.json();
  const templateDocumentId = body.templateDocumentId;
  if (!templateDocumentId) return c.json({ error: "templateDocumentId required" }, 400);

  const stream = await composeDocument({
    projectId,
    templateDocumentId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
    previewOnly: true,
    regenerateSectionMarker: body.regenerateSectionMarker || undefined,
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

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const body = composeGenerateSchema.parse(await c.req.json());

  const stream = await composeDocument({
    projectId,
    templateDocumentId: body.templateDocumentId,
    organizationId: auth.organizationId!,
    userId: auth.userId,
    previewOnly: false,
    editedSections: body.editedSections as any,
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

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

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
  const body = generationModeSchema.parse(await c.req.json());

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, docId), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Document not found" }, 404);

  const [updated] = await db.update(documents).set({
    generationMode: body.mode,
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
  const body = composeConfigSchema.parse(await c.req.json());

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

// ─── FEEDBACK LOOP: Save consultant section edit ───
neemiaRoutes.put("/documents/:docId/sections/:marker", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");
  const marker = c.req.param("marker");

  const projDoc = await db.query.projectDocuments.findFirst({
    where: eq(projectDocuments.id, docId),
  });
  if (!projDoc) return c.json({ error: "Document not found" }, 404);

  // Verify project belongs to org
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projDoc.projectId), eq(projects.organizationId, auth.organizationId!)),
  });
  if (!project) return c.json({ error: "Not authorized" }, 403);

  const { content } = updateSectionContentSchema.parse(await c.req.json());

  // Get latest version number for this section
  const existing = await db.select({ version: composeSectionVersions.version })
    .from(composeSectionVersions)
    .where(and(
      eq(composeSectionVersions.projectDocumentId, docId),
      eq(composeSectionVersions.sectionMarker, marker),
    ))
    .orderBy(desc(composeSectionVersions.version))
    .limit(1);

  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;

  const [ver] = await db.insert(composeSectionVersions).values({
    projectDocumentId: docId,
    sectionMarker: marker,
    version: nextVersion,
    content,
    source: "consultant_edit",
    editedBy: auth.userId,
  }).returning();

  // Also update the composeContent in projectDocuments to reflect the edit
  const composeContent = projDoc.composeContent as any;
  if (composeContent?.sections) {
    const sectionIdx = composeContent.sections.findIndex((s: any) => s.marker === marker);
    if (sectionIdx >= 0) {
      composeContent.sections[sectionIdx].content = content;
      composeContent.sections[sectionIdx].approved = true;
      await db.update(projectDocuments)
        .set({ composeContent })
        .where(eq(projectDocuments.id, docId));
    }
  }

  return c.json({ version: ver });
});

// ─── FEEDBACK LOOP: Get section version history ───
neemiaRoutes.get("/documents/:docId/sections/:marker/versions", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");
  const marker = c.req.param("marker");

  const projDoc = await db.query.projectDocuments.findFirst({
    where: eq(projectDocuments.id, docId),
  });
  if (!projDoc) return c.json({ error: "Document not found" }, 404);

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projDoc.projectId), eq(projects.organizationId, auth.organizationId!)),
  });
  if (!project) return c.json({ error: "Not authorized" }, 403);

  const versions = await db.select().from(composeSectionVersions)
    .where(and(
      eq(composeSectionVersions.projectDocumentId, docId),
      eq(composeSectionVersions.sectionMarker, marker),
    ))
    .orderBy(desc(composeSectionVersions.version));

  return c.json(versions);
});

// F7.4: Rollback to a specific version
neemiaRoutes.post("/documents/:docId/rollback", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");

  // Verify the target version document belongs to user's org
  const projDoc = await verifyProjectDocOrg(docId, auth.organizationId!);
  if (!projDoc) return c.json({ error: "Document not found" }, 404);

  // Set this version as the "active" one by updating all newer versions' status
  // and resetting this one to "generated"
  const [updated] = await db.update(projectDocuments).set({
    status: "generated",
  }).where(eq(projectDocuments.id, docId)).returning();

  return c.json(updated);
});

// F7.5: Download all generated documents as ZIP
neemiaRoutes.get("/projects/:projectId/download-all", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  // Get all generated documents for this project (latest version per template)
  const allDocs = await db.query.projectDocuments.findMany({
    where: eq(projectDocuments.projectId, projectId),
    orderBy: (d, { desc: d2 }) => [d2(d.version)],
  });

  // Deduplicate: keep latest version per templateDocumentId
  const latestByTemplate = new Map<string, typeof allDocs[0]>();
  for (const doc of allDocs) {
    if (!latestByTemplate.has(doc.templateDocumentId)) {
      latestByTemplate.set(doc.templateDocumentId, doc);
    }
  }

  const docsWithUrls = [];
  for (const doc of latestByTemplate.values()) {
    if (doc.generatedFileId) {
      const url = await getFileUrl(doc.generatedFileId);
      if (url) docsWithUrls.push({ id: doc.id, url, name: doc.templateDocumentId });
    }
  }

  if (docsWithUrls.length === 0) {
    return c.json({ error: "No generated documents found" }, 404);
  }

  // For simplicity, return a JSON list of download URLs
  // The frontend can handle downloading them individually or we can implement
  // server-side ZIP later with a proper archiver library
  return c.json({ documents: docsWithUrls });
});

// ═══ FILL-PREVIEW: Pre-check which fields Neemia will actually fill ═══

/**
 * GET /projects/:projectId/fill-preview/:templateDocId
 * Returns a per-field breakdown of what Neemia will fill:
 * - For each template_element key: will it have a value? from which source?
 * - Which keys are missing completely?
 * - Which keys exist but are unconfirmed?
 * This lets the frontend show "will fill" / "will be empty" indicators
 * BEFORE the user triggers generation.
 */
neemiaRoutes.get("/projects/:projectId/fill-preview/:templateDocId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const templateDocId = c.req.param("templateDocId");

  const templateDoc = await db.query.documents.findFirst({
    where: eq(documents.id, templateDocId),
  });
  if (!templateDoc) return c.json({ error: "Template not found" }, 404);

  // Use the same resolution logic as Neemia generate
  const { validateBeforeGenerate: validate } = await import("../services/neemia");
  const validationResult = await validate(projectId, templateDocId);

  // Also load template elements for per-field breakdown
  const tmplEls = await db.query.templateElements.findMany({
    where: eq(templateElements.documentId, templateDocId),
  });

  const projEls = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  // Load placeholder mappings (Path 1: elementDefId resolution)
  const mappings = await db.query.templatePlaceholderMapping.findMany({
    where: eq(templatePlaceholderMapping.templateDocumentId, templateDocId),
  });

  // Build injected values (project metadata, financials, cabinet branding)
  // These are values Neemia injects at generation time that DON'T come from projectElements
  const injectedValues = await buildInjectedValues(projectId, auth.organizationId!);

  const fieldPreview = tmplEls.map(te => {
    // Use SAME two-path resolution as Neemia's buildElementsMap:
    // Path 1: template_placeholder_mapping → elementDefId → projectElements
    const mapping = mappings.find(m => m.placeholderKey === te.key);
    let pe = mapping
      ? projEls.find(p => p.elementDefId === mapping.elementDefId)
      : null;
    // Path 2 (fallback): templateElementId → projectElements
    if (!pe) {
      pe = projEls.find(p => p.templateElementId === te.id);
    }

    const peValue = pe?.value != null && pe.value.trim() !== "";
    // Check injected values (project metadata, financials) as Neemia does
    const injectedValue = injectedValues[te.key] || null;
    const hasValue = peValue || !!injectedValue;
    const resolvedSource = peValue ? (pe?.source || null) : injectedValue ? "auto" : null;

    return {
      key: te.key,
      label: te.label,
      fieldType: te.fieldType,
      pageNum: te.pageNum,
      willFill: hasValue,
      value: peValue ? pe!.value : injectedValue,
      source: resolvedSource,
      confirmed: pe?.confirmed ?? false,
      resolvedVia: peValue
        ? (mapping && pe?.elementDefId ? "elementDef" : "templateElement")
        : injectedValue ? "injected" : "none",
      fillResult: hasValue ? "value" : "[DE COMPLETAT]",
    };
  });

  const filledCount = fieldPreview.filter(f => f.willFill).length;
  const missingCount = fieldPreview.filter(f => !f.willFill).length;
  const unconfirmedCount = fieldPreview.filter(f => f.willFill && !f.confirmed).length;

  return c.json({
    canGenerate: validationResult.canGenerate,
    warnings: validationResult.warnings,
    fields: fieldPreview,
    stats: {
      total: fieldPreview.length,
      filled: filledCount,
      missing: missingCount,
      unconfirmed: unconfirmedCount,
      completenessPercent: fieldPreview.length > 0
        ? Math.round(filledCount / fieldPreview.length * 100)
        : 100,
    },
  });
});

// ═══ FORM-ON-DOCUMENT: Render template as page images with field positions ═══

// In-memory cache for rendered documents (TTL: 10 minutes)
const renderCache = new Map<string, {
  result: any;
  outputDir: string;
  timestamp: number;
}>();
const RENDER_CACHE_TTL = 10 * 60 * 1000;

function cleanupExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of renderCache) {
    if (now - entry.timestamp > RENDER_CACHE_TTL) {
      cleanupRenderOutput(entry.outputDir);
      renderCache.delete(key);
    }
  }
}

/**
 * GET /projects/:projectId/template-render/:templateDocId
 * Renders the template document as page images and returns field positions.
 * Uses template_elements keys as source of truth for field reconciliation.
 */
neemiaRoutes.get("/projects/:projectId/template-render/:templateDocId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const templateDocId = c.req.param("templateDocId");

  const templateDoc = await db.query.documents.findFirst({
    where: eq(documents.id, templateDocId),
  });
  if (!templateDoc) return c.json({ error: "Template not found" }, 404);

  // Load template elements (source of truth for field keys)
  const tmplEls = await db.query.templateElements.findMany({
    where: eq(templateElements.documentId, templateDocId),
  });

  // Build known keys for reconciliation
  const knownKeys = tmplEls.map(te => ({
    key: te.key,
    label: te.label,
    fieldType: te.fieldType,
    pageNum: te.pageNum,
  }));

  // Check cache (invalidated when template changes)
  cleanupExpiredCache();
  const cacheKey = `${templateDocId}:${tmplEls.length}`;
  let renderResult = renderCache.get(cacheKey);

  if (!renderResult) {
    const { buffer } = await getFileBuffer(templateDoc.fileId);
    const fileType = (templateDoc.fileType || "pdf") as "pdf" | "docx" | "xlsx";

    // Pass known keys for reconciliation — the Python script will use
    // fuzzy matching to map detected field positions to template_elements keys
    const { result, outputDir } = await renderDocument(buffer, fileType, knownKeys);

    renderResult = { result, outputDir, timestamp: Date.now() };
    renderCache.set(cacheKey, renderResult);
  }

  // Enrich fields with project element values
  const projEls = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  // Load placeholder mappings for Path 1 resolution (elementDefId)
  const placeholderMappings = await db.query.templatePlaceholderMapping.findMany({
    where: eq(templatePlaceholderMapping.templateDocumentId, templateDocId),
  });

  // Build injected values (same as Neemia generateDocument)
  const injectedValues = await buildInjectedValues(projectId, auth.organizationId!);

  // Build fieldName → project value map using SAME two-path resolution as Neemia
  const fieldValues = new Map<string, {
    value: string | null;
    source: string | null;
    confirmed: boolean;
    templateElementId: string;
    label: string;
    fieldType: string;
    resolvedVia: string;
  }>();

  for (const te of tmplEls) {
    // Path 1: template_placeholder_mapping → elementDefId → projectElements
    const mapping = placeholderMappings.find(m => m.placeholderKey === te.key);
    let pe = mapping
      ? projEls.find(p => p.elementDefId === mapping.elementDefId)
      : null;
    const resolvedViaPath = pe ? "elementDef" : "none";

    // Path 2 (fallback): templateElementId → projectElements
    if (!pe) {
      pe = projEls.find(p => p.templateElementId === te.id);
    }

    const peValue = pe?.value != null && pe.value.trim() !== "";
    const injectedValue = injectedValues[te.key] || null;

    fieldValues.set(te.key, {
      value: peValue ? pe!.value : injectedValue,
      source: peValue ? (pe?.source || null) : injectedValue ? "auto" : null,
      confirmed: pe?.confirmed ?? false,
      templateElementId: te.id,
      label: te.label,
      fieldType: te.fieldType,
      resolvedVia: peValue ? (resolvedViaPath || "templateElement") : injectedValue ? "injected" : "none",
    });
  }

  // Merge field positions with project values
  const enrichedPages = renderResult.result.pages.map((page: any) => ({
    ...page,
    fields: page.fields.map((field: any) => {
      const projData = fieldValues.get(field.fieldName);
      return {
        ...field,
        label: projData?.label || field.knownLabel || field.fieldName.replace(/_/g, " "),
        value: projData?.value || null,
        source: projData?.source || null,
        confirmed: projData?.confirmed ?? false,
        templateElementId: projData?.templateElementId || null,
        fieldType: projData?.fieldType || field.knownFieldType || field.fieldType || "text",
        // Reconciliation quality — for frontend indicators
        willFill: projData !== undefined,  // true = this field WILL be filled by Neemia
      };
    }),
  }));

  // Include unmatched known keys — fields in DB that couldn't be positioned on the page
  // These need to appear in the sidebar field list for manual completion
  const unmatchedKnown = (renderResult.result.unmatchedKnownKeys || []).map((uk: any) => {
    const projData = fieldValues.get(uk.key);
    return {
      ...uk,
      label: projData?.label || uk.label,
      value: projData?.value || null,
      source: projData?.source || null,
      confirmed: projData?.confirmed ?? false,
      templateElementId: projData?.templateElementId || null,
      fieldType: projData?.fieldType || uk.fieldType || "text",
      willFill: projData !== undefined,
    };
  });

  // Compute reconciliation stats
  const allPositioned = enrichedPages.flatMap((p: any) => p.fields);
  const exactMatches = allPositioned.filter((f: any) => f.matchQuality === "exact").length;
  const fuzzyMatches = allPositioned.filter((f: any) => f.matchQuality === "fuzzy").length;
  const unmatched = allPositioned.filter((f: any) => f.matchQuality === "unmatched").length;
  const dbOnly = unmatchedKnown.length;

  return c.json({
    ...renderResult.result,
    pages: enrichedPages,
    unmatchedKnownKeys: unmatchedKnown,
    templateName: templateDoc.name,
    templateFileType: templateDoc.fileType,
    reconciliation: {
      totalTemplateFields: tmplEls.length,
      positionedExact: exactMatches,
      positionedFuzzy: fuzzyMatches,
      positionedUnmatched: unmatched,
      notPositioned: dbOnly,
      coveragePercent: tmplEls.length > 0
        ? Math.round((exactMatches + fuzzyMatches) / tmplEls.length * 100)
        : 100,
    },
  });
});

/**
 * GET /projects/:projectId/template-render/:templateDocId/page/:pageNum
 * Returns the rendered page image as PNG.
 */
neemiaRoutes.get("/projects/:projectId/template-render/:templateDocId/page/:pageNum", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const projectId = c.req.param("projectId");

  const project = await verifyProjectOrg(projectId, auth.organizationId!);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const templateDocId = c.req.param("templateDocId");
  const pageNum = parseInt(c.req.param("pageNum"), 10);

  const cacheKey = `${templateDocId}`;
  const cached = renderCache.get(cacheKey);

  if (!cached) {
    return c.json({ error: "Document not rendered yet. Call template-render first." }, 404);
  }

  const page = cached.result.pages.find((p: any) => p.pageNum === pageNum);
  if (!page) {
    return c.json({ error: `Page ${pageNum} not found` }, 404);
  }

  try {
    const imageBuffer = getPageImage(cached.outputDir, page.imageName);
    return new Response(new Uint8Array(imageBuffer) as any, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch {
    return c.json({ error: "Page image not found" }, 404);
  }
});
