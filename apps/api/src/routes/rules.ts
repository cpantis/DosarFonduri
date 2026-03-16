import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { rules, orgConfig } from "../db/schema";
import { eq, and } from "drizzle-orm";

export const ruleRoutes = new Hono<AppEnv>();

// List rules per document
ruleRoutes.get("/documents/:docId/rules", async (c) => {
  const auth = c.get("auth") as any;
  const docId = c.req.param("docId");

  const result = await db.query.rules.findMany({
    where: and(eq(rules.documentId, docId), eq(rules.organizationId, auth.organizationId)),
    orderBy: (r, { asc }) => [asc(r.sourcePage), asc(r.createdAt)],
  });

  const config = await db.query.orgConfig.findFirst({
    where: (c, { eq }) => eq(c.organizationId, auth.organizationId),
  });
  const threshold = parseFloat(config?.reviewThreshold?.toString() || "0.85");

  const enriched = result.map(r => ({
    ...r,
    needsReview: parseFloat(r.confidence?.toString() || "0") < threshold,
  }));

  return c.json(enriched);
});

// Validate / edit rule — whitelist allowed fields
const updateRuleSchema = z.object({
  description: z.string().min(1).max(5000).optional(),
  type: z.enum(["fixed", "interpreted"]).optional(),
  category: z.string().max(200).optional().nullable(),
  confidence: z.number().min(0).max(1).optional(),
  validated: z.boolean().optional(),
  condition: z.string().max(5000).optional().nullable(),
  sourceText: z.string().max(10000).optional().nullable(),
});

ruleRoutes.put("/:id", async (c) => {
  const auth = c.get("auth") as any;
  const id = c.req.param("id");
  const body = updateRuleSchema.parse(await c.req.json());

  const updates: Record<string, any> = {};
  if (body.description !== undefined) updates.description = body.description;
  if (body.type !== undefined) updates.type = body.type;
  if (body.category !== undefined) updates.category = body.category;
  if (body.confidence !== undefined) updates.confidence = body.confidence;
  if (body.condition !== undefined) updates.condition = body.condition;
  if (body.sourceText !== undefined) updates.sourceText = body.sourceText;
  if (body.validated !== undefined) {
    updates.validated = body.validated;
    updates.validatedBy = body.validated ? auth.userId : null;
    updates.validatedAt = body.validated ? new Date() : null;
  }

  const [updated] = await db.update(rules).set(updates).where(
    and(eq(rules.id, id), eq(rules.organizationId, auth.organizationId))
  ).returning();

  return c.json(updated);
});

// Delete rule
ruleRoutes.delete("/:id", async (c) => {
  const auth = c.get("auth") as any;
  const id = c.req.param("id");

  await db.delete(rules).where(
    and(eq(rules.id, id), eq(rules.organizationId, auth.organizationId))
  );

  return c.json({ ok: true });
});
