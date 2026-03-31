/**
 * Forms routes — FormSpec extraction and management.
 *
 * FORM-1: Universal form format detection and extraction.
 */
import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { db } from "../db";
import { formSpecs, documents, formData, projects, projectElements } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { AuthContext } from "../middleware/auth";
import { getFileBuffer } from "../services/storage";
import { extractAndSaveFormSpec, detectFormFormat, extractFormSpecFromBuffer } from "../services/formSpecExtractor";

export const formRoutes = new Hono<AppEnv>();

/**
 * POST /api/forms/extract
 * Extract FormSpec from an uploaded document.
 */
formRoutes.post("/extract", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const body = await c.req.json();
  const { documentId } = body;

  if (!documentId) return c.json({ error: "documentId is required" }, 400);

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, documentId), eq(documents.organizationId, auth.organizationId)),
  });
  if (!doc) return c.json({ error: "Document not found" }, 404);

  const { buffer, name } = await getFileBuffer(doc.fileId);
  const { formSpecId, spec } = await extractAndSaveFormSpec(
    buffer, name, documentId, auth.organizationId,
  );

  return c.json({
    formSpecId,
    sourceFormat: spec.sourceFormat,
    totalFields: spec.totalFields,
    sections: spec.sections.length,
  }, 201);
});

/**
 * GET /api/forms/spec/:formSpecId
 * Get a FormSpec by ID.
 */
formRoutes.get("/spec/:formSpecId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const formSpecId = c.req.param("formSpecId");
  const spec = await db.query.formSpecs.findFirst({
    where: and(eq(formSpecs.id, formSpecId), eq(formSpecs.organizationId, auth.organizationId)),
  });

  if (!spec) return c.json({ error: "FormSpec not found" }, 404);
  return c.json(spec);
});

/**
 * GET /api/forms/document/:documentId
 * Get the active FormSpec for a document.
 */
formRoutes.get("/document/:documentId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const documentId = c.req.param("documentId");
  const spec = await db.query.formSpecs.findFirst({
    where: and(
      eq(formSpecs.documentId, documentId),
      eq(formSpecs.organizationId, auth.organizationId),
      eq(formSpecs.isActive, true),
    ),
  });

  if (!spec) return c.json({ error: "No FormSpec for this document" }, 404);
  return c.json(spec);
});

/**
 * GET /api/forms/spec/:formSpecId/reference-data
 * Get just the reference data (SO coefficients, budget tables, etc.)
 */
formRoutes.get("/spec/:formSpecId/reference-data", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const formSpecId = c.req.param("formSpecId");
  const spec = await db.query.formSpecs.findFirst({
    where: and(eq(formSpecs.id, formSpecId), eq(formSpecs.organizationId, auth.organizationId)),
    columns: { referenceData: true },
  });

  if (!spec) return c.json({ error: "FormSpec not found" }, 404);
  return c.json(spec.referenceData || {});
});

// ═══════════════════════════════════════════
// FORM-2 — Form data + page-by-page verification
// ═══════════════════════════════════════════

/**
 * GET /api/forms/projects/:projectId/form-data/:formSpecId
 * Get or create form data for a project + form spec.
 */
formRoutes.get("/projects/:projectId/form-data/:formSpecId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const projectId = c.req.param("projectId");
  const formSpecId = c.req.param("formSpecId");

  // Verify project ownership
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, auth.organizationId)),
  });
  if (!project) return c.json({ error: "Project not found" }, 404);

  // Get or create form data
  let fd = await db.query.formData.findFirst({
    where: and(eq(formData.projectId, projectId), eq(formData.formSpecId, formSpecId)),
  });

  if (!fd) {
    const [created] = await db.insert(formData).values({
      projectId,
      formSpecId,
      fieldValues: {},
      fieldSources: {},
      pageApprovals: {},
    }).returning();
    fd = created;
  }

  return c.json(fd);
});

/**
 * PUT /api/forms/projects/:projectId/form-data/:formSpecId/field
 * Update a single field value.
 */
formRoutes.put("/projects/:projectId/form-data/:formSpecId/field", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const projectId = c.req.param("projectId");
  const formSpecId = c.req.param("formSpecId");
  const body = await c.req.json();
  const { fieldId, value } = body;

  if (!fieldId) return c.json({ error: "fieldId is required" }, 400);

  // Upsert form data
  const existing = await db.query.formData.findFirst({
    where: and(eq(formData.projectId, projectId), eq(formData.formSpecId, formSpecId)),
  });

  if (!existing) {
    await db.insert(formData).values({
      projectId,
      formSpecId,
      fieldValues: { [fieldId]: value },
      fieldSources: { [fieldId]: "manual" },
      pageApprovals: {},
    });
  } else {
    const currentValues = (existing.fieldValues as Record<string, any>) || {};
    const currentSources = (existing.fieldSources as Record<string, any>) || {};
    currentValues[fieldId] = value;
    currentSources[fieldId] = "manual";

    // Calculate completion
    const spec = await db.query.formSpecs.findFirst({ where: eq(formSpecs.id, formSpecId) });
    const totalFields = (spec?.totalFields || 0);
    const filledCount = Object.values(currentValues).filter(v => v != null && v !== "").length;
    const pct = totalFields > 0 ? Math.round((filledCount / totalFields) * 100) : 0;

    await db.update(formData).set({
      fieldValues: currentValues,
      fieldSources: currentSources,
      completionPercent: pct,
      updatedAt: new Date(),
    }).where(eq(formData.id, existing.id));
  }

  return c.json({ ok: true });
});

/**
 * POST /api/forms/projects/:projectId/form-data/:formSpecId/approve-page
 * Mark a page as visually approved.
 */
formRoutes.post("/projects/:projectId/form-data/:formSpecId/approve-page", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const projectId = c.req.param("projectId");
  const formSpecId = c.req.param("formSpecId");
  const { pageNum } = await c.req.json();

  if (pageNum == null) return c.json({ error: "pageNum is required" }, 400);

  const existing = await db.query.formData.findFirst({
    where: and(eq(formData.projectId, projectId), eq(formData.formSpecId, formSpecId)),
  });
  if (!existing) return c.json({ error: "Form data not found" }, 404);

  const approvals = (existing.pageApprovals as Record<string, any>) || {};
  approvals[String(pageNum)] = { approved: true, approvedAt: new Date().toISOString(), approvedBy: auth.userId };

  const approvedCount = Object.values(approvals).filter((a: any) => a.approved).length;
  const totalPages = existing.totalPages || 0;

  await db.update(formData).set({
    pageApprovals: approvals,
    approvedPagesCount: approvedCount,
    allPagesApproved: totalPages > 0 && approvedCount >= totalPages,
    updatedAt: new Date(),
  }).where(eq(formData.id, existing.id));

  return c.json({ ok: true, approvedCount, allApproved: totalPages > 0 && approvedCount >= totalPages });
});

/**
 * POST /api/forms/projects/:projectId/form-data/:formSpecId/unapprove-page
 * Revoke page approval.
 */
formRoutes.post("/projects/:projectId/form-data/:formSpecId/unapprove-page", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const projectId = c.req.param("projectId");
  const formSpecId = c.req.param("formSpecId");
  const { pageNum } = await c.req.json();

  const existing = await db.query.formData.findFirst({
    where: and(eq(formData.projectId, projectId), eq(formData.formSpecId, formSpecId)),
  });
  if (!existing) return c.json({ error: "Form data not found" }, 404);

  const approvals = (existing.pageApprovals as Record<string, any>) || {};
  approvals[String(pageNum)] = { approved: false };

  await db.update(formData).set({
    pageApprovals: approvals,
    approvedPagesCount: Object.values(approvals).filter((a: any) => a.approved).length,
    allPagesApproved: false,
    updatedAt: new Date(),
  }).where(eq(formData.id, existing.id));

  return c.json({ ok: true });
});

/**
 * POST /api/forms/projects/:projectId/form-data/:formSpecId/auto-populate
 * Populate field values from project_elements + company data.
 */
formRoutes.post("/projects/:projectId/form-data/:formSpecId/auto-populate", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const projectId = c.req.param("projectId");
  const formSpecId = c.req.param("formSpecId");

  // Load FormSpec
  const spec = await db.query.formSpecs.findFirst({ where: eq(formSpecs.id, formSpecId) });
  if (!spec) return c.json({ error: "FormSpec not found" }, 404);

  // Load project elements
  const elements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  // Build element map (elementDefId-based values)
  const elementMap = new Map<string, { value: string; source: string }>();
  for (const el of elements) {
    if (!el.value) continue;
    // Use element key if available through element definition
    const key = (el as any).elementKey || el.id;
    elementMap.set(key, { value: el.value, source: el.source || "manual" });
  }

  // Get or create form data
  let fd = await db.query.formData.findFirst({
    where: and(eq(formData.projectId, projectId), eq(formData.formSpecId, formSpecId)),
  });

  if (!fd) {
    const [created] = await db.insert(formData).values({
      projectId, formSpecId, fieldValues: {}, fieldSources: {}, pageApprovals: {},
    }).returning();
    fd = created;
  }

  const currentValues = (fd.fieldValues as Record<string, any>) || {};
  const currentSources = (fd.fieldSources as Record<string, any>) || {};
  let populated = 0;

  // Match FormSpec fields to project elements by mappedElementName
  const specData = spec.spec as any;
  for (const section of (specData?.sections || [])) {
    for (const field of (section?.fields || [])) {
      if (currentValues[field.name] && currentValues[field.name] !== "") continue; // don't overwrite

      const mapped = field.mappedElementName || field.name;
      const match = elementMap.get(mapped);
      if (match) {
        currentValues[field.name] = match.value;
        currentSources[field.name] = match.source === "solomon_chat" ? "solomon" : match.source;
        populated++;
      }
    }
  }

  const totalFields = spec.totalFields || 0;
  const filledCount = Object.values(currentValues).filter(v => v != null && v !== "").length;
  const pct = totalFields > 0 ? Math.round((filledCount / totalFields) * 100) : 0;

  await db.update(formData).set({
    fieldValues: currentValues,
    fieldSources: currentSources,
    completionPercent: pct,
    updatedAt: new Date(),
  }).where(eq(formData.id, fd.id));

  return c.json({ populated, remaining: totalFields - filledCount, completionPercent: pct });
});

/**
 * GET /api/forms/projects/:projectId/form-data/:formSpecId/overview
 * Get form overview with per-page stats.
 */
formRoutes.get("/projects/:projectId/form-data/:formSpecId/overview", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const projectId = c.req.param("projectId");
  const formSpecId = c.req.param("formSpecId");

  const spec = await db.query.formSpecs.findFirst({ where: eq(formSpecs.id, formSpecId) });
  if (!spec) return c.json({ error: "FormSpec not found" }, 404);

  const fd = await db.query.formData.findFirst({
    where: and(eq(formData.projectId, projectId), eq(formData.formSpecId, formSpecId)),
  });

  const fieldValues = (fd?.fieldValues as Record<string, any>) || {};
  const approvals = (fd?.pageApprovals as Record<string, any>) || {};

  // Build per-section stats from FormSpec
  const specData = spec.spec as any;
  const sections = (specData?.sections || []).map((s: any, i: number) => {
    const total = (s.fields || []).length;
    const filled = (s.fields || []).filter((f: any) => fieldValues[f.name] && fieldValues[f.name] !== "").length;
    return {
      sectionId: s.id,
      title: s.title,
      order: s.order ?? i,
      fieldsTotal: total,
      fieldsFilled: filled,
      approved: !!approvals[String(i)]?.approved,
    };
  });

  return c.json({
    totalFields: spec.totalFields || 0,
    completionPercent: fd?.completionPercent || 0,
    approvedPages: fd?.approvedPagesCount || 0,
    totalPages: fd?.totalPages || sections.length,
    allApproved: fd?.allPagesApproved || false,
    sections,
  });
});
