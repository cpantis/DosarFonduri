import { Hono } from "hono";
import { db } from "../db";
import { rules, orgConfig } from "../db/schema";
import { eq, and } from "drizzle-orm";

export const ruleRoutes = new Hono();

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

// Validate / edit rule
ruleRoutes.put("/:id", async (c) => {
  const auth = c.get("auth") as any;
  const id = c.req.param("id");
  const body = await c.req.json();

  const [updated] = await db.update(rules).set({
    ...body,
    validatedBy: body.validated ? auth.userId : null,
    validatedAt: body.validated ? new Date() : null,
  }).where(
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
