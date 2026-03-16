import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { templateElements } from "../db/schema";
import { eq, and } from "drizzle-orm";

export const templateRoutes = new Hono<AppEnv>();

// List elements per template document
templateRoutes.get("/documents/:docId/elements", async (c) => {
  const auth = c.get("auth") as any;
  const docId = c.req.param("docId");

  const result = await db.query.templateElements.findMany({
    where: and(
      eq(templateElements.documentId, docId),
      eq(templateElements.organizationId, auth.organizationId),
    ),
    orderBy: (e, { asc }) => [asc(e.pageNum), asc(e.lineNum)],
  });

  return c.json(result);
});

// Add element manually
const addElementSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(255),
  fieldType: z.enum(["text", "number", "textarea", "date", "table", "signature", "select"]),
  pageNum: z.number().int().min(1),
  lineNum: z.number().int().min(0),
});

templateRoutes.post("/documents/:docId/elements", async (c) => {
  const auth = c.get("auth") as any;
  const docId = c.req.param("docId");
  const body = addElementSchema.parse(await c.req.json());

  const [element] = await db.insert(templateElements).values({
    documentId: docId,
    organizationId: auth.organizationId,
    key: body.key,
    label: body.label,
    fieldType: body.fieldType,
    pageNum: body.pageNum,
    lineNum: body.lineNum,
    detected: false,
    validated: false,
  }).returning();

  return c.json(element, 201);
});

// Validate / edit element — whitelist allowed fields
const updateElementSchema = z.object({
  label: z.string().min(1).max(255).optional(),
  fieldType: z.enum(["text", "number", "textarea", "date", "table", "signature", "select"]).optional(),
  fieldValue: z.string().max(10000).optional().nullable(),
  validated: z.boolean().optional(),
  group: z.string().max(100).optional().nullable(),
  isRepeating: z.boolean().optional(),
  rowIndex: z.number().int().min(0).optional().nullable(),
});

templateRoutes.put("/elements/:id", async (c) => {
  const auth = c.get("auth") as any;
  const id = c.req.param("id");
  const body = updateElementSchema.parse(await c.req.json());

  const updates: Record<string, any> = {};
  if (body.label !== undefined) updates.label = body.label;
  if (body.fieldType !== undefined) updates.fieldType = body.fieldType;
  if (body.fieldValue !== undefined) updates.fieldValue = body.fieldValue;
  if (body.validated !== undefined) {
    updates.validated = body.validated;
    updates.validatedBy = body.validated ? auth.userId : null;
  }
  if (body.group !== undefined) updates.group = body.group;
  if (body.isRepeating !== undefined) updates.isRepeating = body.isRepeating;
  if (body.rowIndex !== undefined) updates.rowIndex = body.rowIndex;

  const [updated] = await db.update(templateElements).set(updates).where(
    and(eq(templateElements.id, id), eq(templateElements.organizationId, auth.organizationId))
  ).returning();

  return c.json(updated);
});

// Batch validate page
templateRoutes.put("/documents/:docId/elements/validate-page", async (c) => {
  const auth = c.get("auth") as any;
  const docId = c.req.param("docId");
  const { pageNum, validated } = await c.req.json();

  await db.update(templateElements).set({
    validated,
    validatedBy: validated ? auth.userId : null,
  }).where(
    and(
      eq(templateElements.documentId, docId),
      eq(templateElements.organizationId, auth.organizationId),
      eq(templateElements.pageNum, pageNum),
    )
  );

  return c.json({ ok: true });
});

// Delete element (only manual ones)
templateRoutes.delete("/elements/:id", async (c) => {
  const auth = c.get("auth") as any;
  const id = c.req.param("id");

  const element = await db.query.templateElements.findFirst({
    where: and(eq(templateElements.id, id), eq(templateElements.organizationId, auth.organizationId)),
  });
  if (!element) return c.json({ error: "Not found" }, 404);
  if (element.detected) return c.json({ error: "Nu poti sterge elemente extrase automat" }, 400);

  await db.delete(templateElements).where(eq(templateElements.id, id));
  return c.json({ ok: true });
});
