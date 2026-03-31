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

/**
 * POST /api/forms/projects/:projectId/form-data/:formSpecId/export
 * Export the completed form as a filled PDF/DOCX/XLSX.
 * BLOCKED until allPagesApproved === true.
 */
formRoutes.post("/projects/:projectId/form-data/:formSpecId/export", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const projectId = c.req.param("projectId");
  const formSpecId = c.req.param("formSpecId");

  const fd = await db.query.formData.findFirst({
    where: and(eq(formData.projectId, projectId), eq(formData.formSpecId, formSpecId)),
  });
  if (!fd) return c.json({ error: "Form data not found" }, 404);

  if (!fd.allPagesApproved) {
    return c.json({ error: "Export blocat: nu toate paginile sunt aprobate. Aprobă fiecare pagină vizual înainte de export." }, 400);
  }

  const spec = await db.query.formSpecs.findFirst({ where: eq(formSpecs.id, formSpecId) });
  if (!spec) return c.json({ error: "FormSpec not found" }, 404);

  // Get original document for filling
  if (!spec.documentId) return c.json({ error: "No source document linked to FormSpec" }, 400);
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, spec.documentId) });
  if (!doc) return c.json({ error: "Source document not found" }, 404);

  const { buffer, name: fileName } = await getFileBuffer(doc.fileId);
  const fieldValues = fd.fieldValues as Record<string, any>;

  // Export based on source format
  const sourceFormat = spec.sourceFormat;
  let exportedBuffer: Buffer;
  let exportFileName: string;
  let exportMimeType: string;

  try {
    if (sourceFormat === "xfa" || sourceFormat === "acroform") {
      // Fill PDF using xfaFiller
      const { fillXFAFields } = await import("../services/xfaFiller");
      const xfaResult = await fillXFAFields(buffer, fieldValues);
      exportedBuffer = xfaResult.buffer;
      exportFileName = fileName.replace(/\.pdf$/i, "_completat.pdf");
      exportMimeType = "application/pdf";
    } else if (sourceFormat === "docx") {
      // Fill DOCX using python-docx (replace {{placeholders}})
      const { execFileSync } = await import("child_process");
      const fs = await import("fs");
      const os = await import("os");
      const path = await import("path");
      const crypto = await import("crypto");

      const tmpInput = path.join(os.tmpdir(), `export_${crypto.randomUUID()}.docx`);
      const tmpOutput = path.join(os.tmpdir(), `export_out_${crypto.randomUUID()}.docx`);
      fs.writeFileSync(tmpInput, buffer);

      const script = `
import sys, json
from docx import Document

doc = Document(sys.argv[1])
values = json.loads(sys.argv[3])

for para in doc.paragraphs:
    for key, val in values.items():
        placeholder = "{{" + key + "}}"
        if placeholder in para.text:
            for run in para.runs:
                if placeholder in run.text:
                    run.text = run.text.replace(placeholder, str(val))

for table in doc.tables:
    for row in table.rows:
        for cell in row.cells:
            for key, val in values.items():
                placeholder = "{{" + key + "}}"
                if placeholder in cell.text:
                    for para in cell.paragraphs:
                        for run in para.runs:
                            if placeholder in run.text:
                                run.text = run.text.replace(placeholder, str(val))

doc.save(sys.argv[2])
`;
      const scriptPath = path.join(os.tmpdir(), `fill_docx_${crypto.randomUUID()}.py`);
      fs.writeFileSync(scriptPath, script);

      execFileSync("python3", [scriptPath, tmpInput, tmpOutput, JSON.stringify(fieldValues)], {
        encoding: "utf-8",
        timeout: 60000,
      });

      exportedBuffer = fs.readFileSync(tmpOutput);
      exportFileName = fileName.replace(/\.docx$/i, "_completat.docx");
      exportMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      // Cleanup
      try { fs.unlinkSync(tmpInput); fs.unlinkSync(tmpOutput); fs.unlinkSync(scriptPath); } catch {}
    } else if (sourceFormat === "xlsx") {
      // Fill XLSX using openpyxl
      const { execFileSync } = await import("child_process");
      const fs = await import("fs");
      const os = await import("os");
      const path = await import("path");
      const crypto = await import("crypto");

      const tmpInput = path.join(os.tmpdir(), `export_${crypto.randomUUID()}.xlsx`);
      const tmpOutput = path.join(os.tmpdir(), `export_out_${crypto.randomUUID()}.xlsx`);
      fs.writeFileSync(tmpInput, buffer);

      const script = `
import sys, json
from openpyxl import load_workbook

wb = load_workbook(sys.argv[1])
values = json.loads(sys.argv[3])

for key, val in values.items():
    # key format: "SheetName!A1"
    if "!" in key:
        sheet_name, cell_ref = key.split("!", 1)
        if sheet_name in wb.sheetnames:
            wb[sheet_name][cell_ref] = val

wb.save(sys.argv[2])
`;
      const scriptPath = path.join(os.tmpdir(), `fill_xlsx_${crypto.randomUUID()}.py`);
      fs.writeFileSync(scriptPath, script);

      execFileSync("python3", [scriptPath, tmpInput, tmpOutput, JSON.stringify(fieldValues)], {
        encoding: "utf-8",
        timeout: 60000,
      });

      exportedBuffer = fs.readFileSync(tmpOutput);
      exportFileName = fileName.replace(/\.xlsx$/i, "_completat.xlsx");
      exportMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

      try { fs.unlinkSync(tmpInput); fs.unlinkSync(tmpOutput); fs.unlinkSync(scriptPath); } catch {}
    } else {
      return c.json({ error: `Export not supported for format: ${sourceFormat}` }, 400);
    }
  } catch (err: any) {
    console.error("[forms/export] Export failed:", err.message);
    return c.json({ error: `Export eșuat: ${err.message}` }, 500);
  }

  // Upload exported file to R2
  const { uploadFile } = await import("../services/storage");
  const exportFileId = await uploadFile(exportedBuffer, exportFileName, exportMimeType, auth.organizationId, auth.userId, "exports");

  const { getFileUrl } = await import("../services/storage");
  const downloadUrl = await getFileUrl(exportFileId);

  return c.json({ downloadUrl, fileName: exportFileName, fileSize: exportedBuffer.length });
});
