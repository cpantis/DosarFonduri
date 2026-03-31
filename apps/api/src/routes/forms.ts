/**
 * Forms routes — FormSpec extraction and management.
 *
 * FORM-1: Universal form format detection and extraction.
 */
import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { db } from "../db";
import { formSpecs, documents } from "../db/schema";
import { eq, and } from "drizzle-orm";
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
