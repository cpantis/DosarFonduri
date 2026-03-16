import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { updateRefTableSchema, createRuleRefLinkSchema, createElementRuleLinkSchema, validateElementSchema } from "@dosarfonduri/shared";
import { guideReferenceTables, ruleReferenceLinks, elementRuleLinks, rules, templateElements, documents } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";

export const referenceTableRoutes = new Hono<AppEnv>();

// --- LIST REFERENCE TABLES FOR A DOCUMENT ---
referenceTableRoutes.get("/documents/:docId/tables", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const docId = c.req.param("docId");

  const tables = await db.query.guideReferenceTables.findMany({
    where: and(
      eq(guideReferenceTables.documentId, docId),
      eq(guideReferenceTables.organizationId, auth.organizationId!),
    ),
    orderBy: (t, { asc }) => [asc(t.sourcePage), asc(t.name)],
  });

  return c.json(tables);
});

// --- LIST ALL REFERENCE TABLES FOR ORGANIZATION ---
referenceTableRoutes.get("/tables", async (c) => {
  const auth = c.get("auth") as AuthContext;

  const tables = await db.query.guideReferenceTables.findMany({
    where: eq(guideReferenceTables.organizationId, auth.organizationId!),
    orderBy: (t, { asc }) => [asc(t.name)],
  });

  return c.json(tables);
});

// --- GET SINGLE REFERENCE TABLE ---
referenceTableRoutes.get("/tables/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const table = await db.query.guideReferenceTables.findFirst({
    where: and(
      eq(guideReferenceTables.id, id),
      eq(guideReferenceTables.organizationId, auth.organizationId!),
    ),
  });
  if (!table) return c.json({ error: "Not found" }, 404);

  // Include linked rules
  const links = await db.query.ruleReferenceLinks.findMany({
    where: eq(ruleReferenceLinks.referenceTableId, id),
  });

  const linkedRuleIds = links.map(l => l.ruleId);
  const linkedRules = linkedRuleIds.length > 0
    ? await Promise.all(linkedRuleIds.map(ruleId =>
        db.query.rules.findFirst({ where: eq(rules.id, ruleId) })
      ))
    : [];

  return c.json({
    ...table,
    linkedRules: links.map((link, i) => ({
      ...link,
      rule: linkedRules[i],
    })),
  });
});

// --- CREATE REFERENCE TABLE ---
const createTableSchema = z.object({
  documentId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  tableType: z.enum(["lookup", "classification", "list", "matrix"]),
  schema: z.array(z.object({ key: z.string(), label: z.string(), type: z.string() })).optional(),
  data: z.array(z.record(z.any())).optional(),
  lookupKey: z.string().optional(),
  sourcePage: z.number().optional(),
  sourceText: z.string().optional(),
  extractedBy: z.enum(["ai", "manual"]).optional(),
});

referenceTableRoutes.post("/tables", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const body = createTableSchema.parse(await c.req.json());

  const [table] = await db.insert(guideReferenceTables).values({
    documentId: body.documentId,
    organizationId: auth.organizationId!,
    name: body.name,
    description: body.description,
    tableType: body.tableType,
    schema: body.schema,
    data: body.data,
    lookupKey: body.lookupKey,
    sourcePage: body.sourcePage,
    sourceText: body.sourceText,
    extractedBy: (body.extractedBy || "manual") as any,
    validated: false,
  }).returning();

  return c.json(table, 201);
});

// --- UPDATE REFERENCE TABLE ---
referenceTableRoutes.put("/tables/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const body = updateRefTableSchema.parse(await c.req.json());

  const existing = await db.query.guideReferenceTables.findFirst({
    where: and(eq(guideReferenceTables.id, id), eq(guideReferenceTables.organizationId, auth.organizationId!)),
  });
  if (!existing) return c.json({ error: "Not found" }, 404);

  const updateData: Record<string, any> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.tableType !== undefined) updateData.tableType = body.tableType;
  if (body.schema !== undefined) updateData.schema = body.schema;
  if (body.data !== undefined) updateData.data = body.data;
  if (body.lookupKey !== undefined) updateData.lookupKey = body.lookupKey;
  if (body.validated !== undefined) {
    updateData.validated = body.validated;
    updateData.validatedBy = body.validated ? auth.userId : null;
    updateData.validatedAt = body.validated ? new Date() : null;
  }

  const [updated] = await db.update(guideReferenceTables)
    .set(updateData)
    .where(eq(guideReferenceTables.id, id))
    .returning();

  return c.json(updated);
});

// --- DELETE REFERENCE TABLE ---
referenceTableRoutes.delete("/tables/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  await db.delete(guideReferenceTables).where(
    and(eq(guideReferenceTables.id, id), eq(guideReferenceTables.organizationId, auth.organizationId!))
  );

  return c.json({ ok: true });
});

// --- RULE ↔ REFERENCE TABLE LINKS ---

// List links for a rule
referenceTableRoutes.get("/rules/:ruleId/reference-links", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const ruleId = c.req.param("ruleId");

  // Verify rule belongs to org
  const rule = await db.query.rules.findFirst({
    where: and(eq(rules.id, ruleId), eq(rules.organizationId, auth.organizationId!)),
  });
  if (!rule) return c.json({ error: "Rule not found" }, 404);

  const links = await db.query.ruleReferenceLinks.findMany({
    where: eq(ruleReferenceLinks.ruleId, ruleId),
  });

  // Enrich with table info
  const enriched = await Promise.all(links.map(async (link) => {
    const table = await db.query.guideReferenceTables.findFirst({
      where: eq(guideReferenceTables.id, link.referenceTableId),
    });
    return { ...link, referenceTable: table };
  }));

  return c.json(enriched);
});

// List links for a reference table
referenceTableRoutes.get("/tables/:tableId/rule-links", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const tableId = c.req.param("tableId");

  // Verify table belongs to org
  const table = await db.query.guideReferenceTables.findFirst({
    where: and(eq(guideReferenceTables.id, tableId), eq(guideReferenceTables.organizationId, auth.organizationId!)),
  });
  if (!table) return c.json({ error: "Table not found" }, 404);

  const links = await db.query.ruleReferenceLinks.findMany({
    where: eq(ruleReferenceLinks.referenceTableId, tableId),
  });

  const enriched = await Promise.all(links.map(async (link) => {
    const rule = await db.query.rules.findFirst({
      where: eq(rules.id, link.ruleId),
    });
    return { ...link, rule };
  }));

  return c.json(enriched);
});

// Create rule-reference link
referenceTableRoutes.post("/rule-reference-links", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const body = createRuleRefLinkSchema.parse(await c.req.json());

  // Verify both rule and table belong to org
  const rule = await db.query.rules.findFirst({
    where: and(eq(rules.id, body.ruleId), eq(rules.organizationId, auth.organizationId!)),
  });
  if (!rule) return c.json({ error: "Rule not found" }, 404);

  const table = await db.query.guideReferenceTables.findFirst({
    where: and(eq(guideReferenceTables.id, body.referenceTableId), eq(guideReferenceTables.organizationId, auth.organizationId!)),
  });
  if (!table) return c.json({ error: "Reference table not found" }, 404);

  const [link] = await db.insert(ruleReferenceLinks).values({
    ruleId: body.ruleId,
    referenceTableId: body.referenceTableId,
    usage: body.usage,
    description: body.description,
  }).returning();

  return c.json(link, 201);
});

// Delete rule-reference link
referenceTableRoutes.delete("/rule-reference-links/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  // Verify the link's rule belongs to org
  const link = await db.query.ruleReferenceLinks.findFirst({
    where: eq(ruleReferenceLinks.id, id),
  });
  if (!link) return c.json({ error: "Link not found" }, 404);

  const rule = await db.query.rules.findFirst({
    where: and(eq(rules.id, link.ruleId), eq(rules.organizationId, auth.organizationId!)),
  });
  if (!rule) return c.json({ error: "Not authorized" }, 403);

  await db.delete(ruleReferenceLinks).where(eq(ruleReferenceLinks.id, id));
  return c.json({ ok: true });
});

// --- ELEMENT ↔ RULE LINKS ---

// List links for an element
referenceTableRoutes.get("/elements/:elementId/rule-links", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const elementId = c.req.param("elementId");

  // Verify element belongs to org (via document)
  const element = await db.query.templateElements.findFirst({
    where: eq(templateElements.id, elementId),
  });
  if (!element) return c.json({ error: "Element not found" }, 404);

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, element.documentId), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Not authorized" }, 403);

  const links = await db.query.elementRuleLinks.findMany({
    where: eq(elementRuleLinks.templateElementId, elementId),
  });

  const enriched = await Promise.all(links.map(async (link) => {
    const rule = await db.query.rules.findFirst({
      where: eq(rules.id, link.ruleId),
    });
    // Also get reference tables linked to this rule
    const refLinks = await db.query.ruleReferenceLinks.findMany({
      where: eq(ruleReferenceLinks.ruleId, link.ruleId),
    });
    const refTables = await Promise.all(refLinks.map(rl =>
      db.query.guideReferenceTables.findFirst({
        where: eq(guideReferenceTables.id, rl.referenceTableId),
      })
    ));
    return {
      ...link,
      rule,
      referenceTables: refLinks.map((rl, i) => ({ ...rl, table: refTables[i] })),
    };
  }));

  return c.json(enriched);
});

// Create element-rule link
referenceTableRoutes.post("/element-rule-links", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const body = createElementRuleLinkSchema.parse(await c.req.json());

  if (!body.templateElementId) return c.json({ error: "templateElementId is required" }, 400);

  // Verify rule belongs to org
  const rule = await db.query.rules.findFirst({
    where: and(eq(rules.id, body.ruleId), eq(rules.organizationId, auth.organizationId!)),
  });
  if (!rule) return c.json({ error: "Rule not found" }, 404);

  // Verify element belongs to org (via document)
  const element = await db.query.templateElements.findFirst({
    where: eq(templateElements.id, body.templateElementId),
  });
  if (!element) return c.json({ error: "Element not found" }, 404);

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, element.documentId), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Not authorized" }, 403);

  const [link] = await db.insert(elementRuleLinks).values({
    templateElementId: body.templateElementId,
    ruleId: body.ruleId,
    role: body.role,
    description: body.description,
  }).returning();

  return c.json(link, 201);
});

// Delete element-rule link
referenceTableRoutes.delete("/element-rule-links/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  // Verify the link's rule belongs to org
  const link = await db.query.elementRuleLinks.findFirst({
    where: eq(elementRuleLinks.id, id),
  });
  if (!link) return c.json({ error: "Link not found" }, 404);

  const rule = await db.query.rules.findFirst({
    where: and(eq(rules.id, link.ruleId), eq(rules.organizationId, auth.organizationId!)),
  });
  if (!rule) return c.json({ error: "Not authorized" }, 403);

  await db.delete(elementRuleLinks).where(eq(elementRuleLinks.id, id));
  return c.json({ ok: true });
});

// --- VALIDATE ELEMENT VALUE ---
// Cross-checks an element's value against linked rules and reference tables
referenceTableRoutes.post("/validate-element", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const { elementId, value, projectId } = validateElementSchema.parse(await c.req.json());

  // Get element and verify org ownership
  const element = await db.query.templateElements.findFirst({
    where: eq(templateElements.id, elementId),
  });
  if (!element) return c.json({ error: "Element not found" }, 404);

  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, element.documentId), eq(documents.organizationId, auth.organizationId!)),
  });
  if (!doc) return c.json({ error: "Not authorized" }, 403);

  // Get linked rules via element_rule_links
  const elemLinks = await db.query.elementRuleLinks.findMany({
    where: eq(elementRuleLinks.templateElementId, elementId),
  });

  const results: Array<{
    ruleId: string;
    ruleText: string;
    ruleType: string;
    status: "passed" | "failed" | "warning" | "info";
    message: string;
    referenceTable?: { name: string; matchedRow?: Record<string, any> };
  }> = [];

  for (const elemLink of elemLinks) {
    const rule = await db.query.rules.findFirst({
      where: eq(rules.id, elemLink.ruleId),
    });
    if (!rule) continue;

    // Get reference tables linked to this rule
    const refLinks = await db.query.ruleReferenceLinks.findMany({
      where: eq(ruleReferenceLinks.ruleId, rule.id),
    });

    if (refLinks.length === 0) {
      // Rule without reference table — basic validation
      results.push({
        ruleId: rule.id,
        ruleText: rule.description,
        ruleType: rule.type,
        status: rule.type === "fixed" ? "info" : "warning",
        message: rule.type === "fixed"
          ? `Regulă fixă: ${rule.description}`
          : `Regulă interpretată — necesită verificare manuală`,
      });
      continue;
    }

    // Cross-check against each reference table
    for (const refLink of refLinks) {
      const refTable = await db.query.guideReferenceTables.findFirst({
        where: eq(guideReferenceTables.id, refLink.referenceTableId),
      });
      if (!refTable || !refTable.data) continue;

      const tableData = refTable.data as Array<Record<string, any>>;
      const lookupKey = refTable.lookupKey || "key";

      // Try to find value in reference table (supports exact, substring, and numeric range matching)
      const searchValue = String(value || "").toLowerCase().trim();
      const searchNum = parseFloat(searchValue.replace(/\./g, "").replace(",", "."));
      const matchedRow = tableData.find(row => {
        const cellValue = String(row[lookupKey] || "").toLowerCase();
        // Exact or substring match
        if (cellValue === searchValue || cellValue.includes(searchValue) || searchValue.includes(cellValue)) {
          return true;
        }
        // Numeric range match: check for "min" and "max" columns (e.g., Anexa 3 correlation tables)
        if (!isNaN(searchNum)) {
          const minKeys = Object.keys(row).filter(k => /min|de_la|lower|start/i.test(k));
          const maxKeys = Object.keys(row).filter(k => /max|pana_la|upper|end/i.test(k));
          for (const minK of minKeys) {
            for (const maxK of maxKeys) {
              const minVal = parseFloat(String(row[minK] || "0").replace(/\./g, "").replace(",", "."));
              const maxVal = parseFloat(String(row[maxK] || "0").replace(/\./g, "").replace(",", "."));
              if (!isNaN(minVal) && !isNaN(maxVal) && searchNum >= minVal && searchNum <= maxVal) {
                return true;
              }
            }
          }
        }
        return false;
      });

      if (refLink.usage === "validates") {
        results.push({
          ruleId: rule.id,
          ruleText: rule.description,
          ruleType: rule.type,
          status: matchedRow ? "passed" : "failed",
          message: matchedRow
            ? `Valoare validată în ${refTable.name}`
            : `Valoarea "${value}" nu a fost găsită în ${refTable.name}`,
          referenceTable: { name: refTable.name, matchedRow: matchedRow || undefined },
        });
      } else if (refLink.usage === "scores") {
        results.push({
          ruleId: rule.id,
          ruleText: rule.description,
          ruleType: rule.type,
          status: matchedRow ? "passed" : "warning",
          message: matchedRow
            ? `Scor din ${refTable.name}: ${JSON.stringify(matchedRow)}`
            : `Nu s-a găsit scor pentru "${value}" în ${refTable.name}`,
          referenceTable: { name: refTable.name, matchedRow: matchedRow || undefined },
        });
      } else if (refLink.usage === "classifies") {
        results.push({
          ruleId: rule.id,
          ruleText: rule.description,
          ruleType: rule.type,
          status: matchedRow ? "info" : "warning",
          message: matchedRow
            ? `Clasificare: ${JSON.stringify(matchedRow)}`
            : `Valoarea "${value}" nu apare în clasificarea ${refTable.name}`,
          referenceTable: { name: refTable.name, matchedRow: matchedRow || undefined },
        });
      }
    }
  }

  return c.json({
    elementId,
    elementKey: element.key,
    elementLabel: element.label,
    value,
    validationResults: results,
    totalChecks: results.length,
    passed: results.filter(r => r.status === "passed").length,
    failed: results.filter(r => r.status === "failed").length,
    warnings: results.filter(r => r.status === "warning").length,
  });
});
