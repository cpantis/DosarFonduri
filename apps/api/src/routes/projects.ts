import type { AppEnv } from "../types/hono";
import { Hono } from "hono";
import { verify } from "hono/jwt";
import { z } from "zod";
import { db } from "../db";
import {
  projects, projectElements, projectEligibility, projectDocuments,
  projectChecklist, templateElements, elementDefinitions, rules, companies, companyFinancials,
  documentFolders, documents, auditLog, orgConfig, users, elementAuditLog, scoringCriteria,
} from "../db/schema";
import { eq, and, count, asc, desc, sql, inArray, sum } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";
import {
  updateProjectSchema,
  updateElementSchema,
  bulkConfirmElementsSchema,
  overrideEligibilitySchema,
  createChecklistItemSchema,
  updateChecklistItemSchema,
} from "@dosarfonduri/shared";
import { checkEligibility } from "../services/eligibility";
import { deleteFile, getFileUrl } from "../services/storage";
import { validateElement, logElementChange } from "../services/elementValidation";
import { computeProjectScores } from "../services/scoring";
import { publishElementValidated, publishEligibilityUpdated, publishScoreUpdated } from "../lib/sse";
import { validateBudget } from "../services/budgetValidation";
import { getApprovedProjectLearnings } from "../services/projectLearning";

export const projectRoutes = new Hono<AppEnv>();

// Lock timeout: 30 minutes of inactivity
const LOCK_TIMEOUT_MS = 30 * 60 * 1000;

function isLockExpired(lockedAt: Date | null): boolean {
  if (!lockedAt) return true;
  return Date.now() - lockedAt.getTime() > LOCK_TIMEOUT_MS;
}

async function requireLock(projectId: string, userId: string): Promise<string | null> {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return "Not found";
  if (!project.lockedBy || isLockExpired(project.lockedAt)) return "Proiectul nu este blocat de tine";
  if (project.lockedBy !== userId) return "Proiectul este blocat de alt utilizator";
  return null; // ok
}

/** Verify that a project belongs to the authenticated user's organization */
async function verifyProjectOwnership(projectId: string, orgId: string): Promise<boolean> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, orgId)),
  });
  return !!project;
}

// Helper: build program path (Session → Measure → Program)
async function buildProgramPath(folderId: string): Promise<{ program: string; masura: string; sesiune: string }> {
  const folder = await db.query.documentFolders.findFirst({ where: eq(documentFolders.id, folderId) });
  if (!folder) return { program: "", masura: "", sesiune: "" };

  const sesiune = folder.name;
  let masura = "";
  let program = "";

  if (folder.parentId) {
    const parent = await db.query.documentFolders.findFirst({ where: eq(documentFolders.id, folder.parentId) });
    if (parent) {
      masura = parent.name;
      if (parent.parentId) {
        const grandparent = await db.query.documentFolders.findFirst({ where: eq(documentFolders.id, parent.parentId) });
        if (grandparent) program = grandparent.name;
      }
    }
  }

  return { program, masura, sesiune };
}

// Helper: get templates from session
async function getProjectTemplates(folderId: string, orgId: string) {
  const templateFolder = await db.query.documentFolders.findFirst({
    where: and(
      eq(documentFolders.parentId, folderId),
      eq(documentFolders.type, "templateuri"),
      eq(documentFolders.organizationId, orgId),
    ),
  });
  if (!templateFolder) return [];

  return db.query.documents.findMany({
    where: eq(documents.folderId, templateFolder.id),
  });
}

// ─── LIST PROJECTS ───
projectRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const result = await db.query.projects.findMany({
    where: eq(projects.organizationId, auth.organizationId),
    orderBy: (p, { desc }) => [desc(p.updatedAt)],
  });

  if (result.length === 0) return c.json([]);

  const projectIds = result.map(p => p.id);
  const companyIds = [...new Set(result.map(p => p.companyId))];

  // Batch: fetch all companies for these projects
  const companiesList = companyIds.length > 0
    ? await db.query.companies.findMany({ where: inArray(companies.id, companyIds) })
    : [];
  const companyMap = Object.fromEntries(companiesList.map(c => [c.id, c]));

  // Batch: element stats per project (total, filled, confirmed)
  const elementStats = await db
    .select({
      projectId: projectElements.projectId,
      total: count(),
      filled: sql<number>`count(case when ${projectElements.value} is not null and trim(${projectElements.value}) != '' then 1 end)`,
      confirmed: sql<number>`count(case when ${projectElements.confirmed} = true then 1 end)`,
    })
    .from(projectElements)
    .where(inArray(projectElements.projectId, projectIds))
    .groupBy(projectElements.projectId);
  const elemMap = Object.fromEntries(elementStats.map(e => [e.projectId, e]));

  // Batch: eligibility stats per project
  const eligStats = await db
    .select({
      projectId: projectEligibility.projectId,
      total: count(),
      passed: sql<number>`count(case when ${projectEligibility.status} = 'passed' then 1 end)`,
    })
    .from(projectEligibility)
    .where(inArray(projectEligibility.projectId, projectIds))
    .groupBy(projectEligibility.projectId);
  const eligMap = Object.fromEntries(eligStats.map(e => [e.projectId, e]));

  // Batch: document stats per project
  const docStats = await db
    .select({
      projectId: projectDocuments.projectId,
      total: count(),
      done: sql<number>`count(case when ${projectDocuments.status} in ('generated', 'validated') then 1 end)`,
      validated: sql<number>`count(case when ${projectDocuments.status} = 'validated' then 1 end)`,
    })
    .from(projectDocuments)
    .where(inArray(projectDocuments.projectId, projectIds))
    .groupBy(projectDocuments.projectId);
  const docMap = Object.fromEntries(docStats.map(d => [d.projectId, d]));

  // Batch: lock user names
  const lockerIds = [...new Set(result.filter(p => p.lockedBy && !isLockExpired(p.lockedAt)).map(p => p.lockedBy!))];
  const lockers = lockerIds.length > 0
    ? await db.query.users.findMany({ where: inArray(users.id, lockerIds) })
    : [];
  const lockerMap = Object.fromEntries(lockers.map(u => [u.id, u.name]));

  // Build program paths (still per-project but these are just folder lookups)
  const folderIds = [...new Set(result.map(p => p.folderId))];
  const pathCache: Record<string, { program: string; masura: string; sesiune: string }> = {};
  for (const fid of folderIds) {
    pathCache[fid] = await buildProgramPath(fid);
  }

  const enriched = result.map(p => {
    const company = companyMap[p.companyId];
    const elem = elemMap[p.id] || { total: 0, filled: 0, confirmed: 0 };
    const elig = eligMap[p.id] || { total: 0, passed: 0 };
    const doc = docMap[p.id] || { total: 0, done: 0, validated: 0 };
    const lockActive = p.lockedBy && !isLockExpired(p.lockedAt);

    return {
      ...p,
      company: company ? { denumire: company.denumire, cui: company.cui } : null,
      programPath: pathCache[p.folderId] || "",
      lock: lockActive ? { lockedBy: p.lockedBy, lockedByName: lockerMap[p.lockedBy!] || null, lockedAt: p.lockedAt } : null,
      progress: {
        eligibility: { passed: Number(elig.passed), total: Number(elig.total) },
        elements: { filled: Number(elem.filled), total: Number(elem.total), confirmed: Number(elem.confirmed) },
        docs: { done: Number(doc.done), total: Number(doc.total) },
        templates: { done: Number(doc.validated), total: Number(doc.total) },
      },
      scoreSummary: null, // Deferred to project detail view for performance
    };
  });

  return c.json(enriched);
});

// ─── CREATE PROJECT ───
const createSchema = z.object({
  name: z.string().min(3),
  companyId: z.string().uuid(),
  folderId: z.string().uuid(),
});

projectRoutes.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);
  const body = createSchema.parse(await c.req.json());

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, body.companyId), eq(companies.organizationId, auth.organizationId)),
  });
  if (!company) return c.json({ error: "Firma nu a fost găsită" }, 404);

  const folder = await db.query.documentFolders.findFirst({
    where: and(eq(documentFolders.id, body.folderId), eq(documentFolders.organizationId, auth.organizationId)),
  });
  if (!folder) return c.json({ error: "Sesiunea nu a fost găsită" }, 404);

  // Create project + copy template elements in a single transaction
  const orgId = auth.organizationId!;
  let project: any;
  try {
    project = await db.transaction(async (tx) => {
      const [proj] = await tx.insert(projects).values({
        organizationId: orgId,
        companyId: body.companyId,
        folderId: body.folderId,
        name: body.name,
        status: "draft",
        consultantId: auth.userId,
      }).returning();

      // Copy template elements as project elements
      const templateDocs = await getProjectTemplates(body.folderId, orgId);
      for (const doc of templateDocs) {
        const elements = await db.query.templateElements.findMany({
          where: eq(templateElements.documentId, doc.id),
        });

        if (elements.length > 0) {
          await tx.insert(projectElements).values(
            elements.map(el => ({
              projectId: proj.id,
              templateElementId: el.id,
              value: null,
              source: "manual" as const,
              confirmed: false,
            }))
          );
        }
      }

      return proj;
    });
  } catch (err: any) {
    console.error("[projects/create] Transaction failed:", err.message);
    return c.json({ error: `Eroare la crearea proiectului: ${err.message}` }, 500);
  }

  // Post-creation steps (best-effort, fire-and-forget — don't block response)
  // The project is already committed; these enrich it in the background.
  Promise.resolve().then(async () => {
    try { await prefillFromCompany(project.id, company); } catch (e: any) {
      console.warn("[projects/create] Prefill warning:", e.message);
    }
    try { await populateChecklistFromRules(project.id, project.folderId, orgId); } catch (e: any) {
      console.warn("[projects/create] Checklist warning:", e.message);
    }
    try { await checkEligibility(project.id, orgId); } catch (e: any) {
      console.warn("[projects/create] Eligibility warning:", e.message);
    }
  });

  return c.json(project, 201);
});

// Pre-fill fields from ONRC
async function prefillFromCompany(projectId: string, company: any) {
  const elements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  // Get template element keys for each project element
  for (const el of elements) {
    if (!el.templateElementId) continue;
    const templateEl = await db.query.templateElements.findFirst({
      where: eq(templateElements.id, el.templateElementId),
    });
    if (!templateEl) continue;

    const onrcMapping: Record<string, string> = {
      denumire_firma: company.denumire,
      cui: company.cui,
      nr_reg_comert: company.regCom,
      adresa_sediu: company.adresa,
      cod_caen: company.caen || "",
      telefon: company.telefon,
      email: company.email,
      website: company.website,
      forma_juridica: company.formaJuridica,
      an_infiintare: company.anInfiintare?.toString(),
    };

    const key = templateEl.key;
    if (key && onrcMapping[key]) {
      await db.update(projectElements).set({
        value: onrcMapping[key],
        source: "onrc",
      }).where(eq(projectElements.id, el.id));
    }
  }
}

// Auto-populate checklist from guide rules
async function populateChecklistFromRules(projectId: string, folderId: string, orgId: string) {
  const guideFolders = await db.query.documentFolders.findMany({
    where: and(
      eq(documentFolders.parentId, folderId),
      eq(documentFolders.type, "ghiduri"),
    ),
  });

  const allRules: any[] = [];
  for (const folder of guideFolders) {
    const docs = await db.query.documents.findMany({
      where: eq(documents.folderId, folder.id),
    });
    for (const doc of docs) {
      const docRules = await db.query.rules.findMany({
        where: eq(rules.documentId, doc.id),
      });
      allRules.push(...docRules);
    }
  }

  const checklistItems = allRules
    .filter(r => r.category === "documente_necesare" || r.description?.toLowerCase().includes("document"))
    .map((r, idx) => ({
      projectId,
      name: r.description,
      category: categorizeDocument(r),
      source: "ghid" as const,
      sortOrder: idx,
    }));

  if (checklistItems.length > 0) {
    await db.insert(projectChecklist).values(checklistItems);
  }
}

function categorizeDocument(rule: any): string {
  const desc = (rule.description || "").toLowerCase();
  if (desc.includes("bilanț") || desc.includes("financiar") || desc.includes("buget") || desc.includes("contabil")) {
    return "Documente financiare";
  }
  if (desc.includes("tehnic") || desc.includes("fezabilitate") || desc.includes("memoriu")) {
    return "Documente tehnice";
  }
  if (desc.includes("declarați") || desc.includes("angajament") || desc.includes("acord")) {
    return "Declarații & Angajamente";
  }
  return "Documente juridice";
}

// ─── PROJECT DETAILS ───
projectRoutes.get("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.organizationId, auth.organizationId!)),
  });
  if (!project) return c.json({ error: "Not found" }, 404);

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, project.companyId),
  });

  const folder = await db.query.documentFolders.findFirst({
    where: eq(documentFolders.id, project.folderId),
  });

  const elements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, id),
  });

  // Enrich elements with template element AND element definition data
  const enrichedElements = await Promise.all(elements.map(async (el) => {
    const templateEl = el.templateElementId ? await db.query.templateElements.findFirst({
      where: eq(templateElements.id, el.templateElementId),
    }) : null;

    // Also resolve element_definition (the new canonical anchor)
    let elemDef = null;
    if (el.elementDefId) {
      elemDef = await db.query.elementDefinitions.findFirst({
        where: eq(elementDefinitions.id, el.elementDefId),
      });
    }

    return { ...el, templateElement: templateEl, elementDefinition: elemDef };
  }));

  const eligibility = await db.query.projectEligibility.findMany({
    where: eq(projectEligibility.projectId, id),
  });

  const generatedDocs = await db.query.projectDocuments.findMany({
    where: eq(projectDocuments.projectId, id),
  });

  const checklist = await db.query.projectChecklist.findMany({
    where: eq(projectChecklist.projectId, id),
    orderBy: (c, { asc }) => [asc(c.category), asc(c.sortOrder)],
  });

  const programPath = await buildProgramPath(project.folderId);

  // Fetch guide trust score for this project's folder
  const guideDoc = await db.query.documents.findFirst({
    where: and(
      eq(documents.folderId, project.folderId),
      eq(documents.processingType, "ghid"),
      eq(documents.status, "processed"),
    ),
    columns: { trustScore: true, completenessReport: true },
  });

  return c.json({
    ...project,
    company,
    folder,
    programPath,
    elements: enrichedElements,
    eligibility,
    generatedDocs,
    checklist,
    guideTrustScore: guideDoc?.trustScore ? Number(guideDoc.trustScore) : null,
    guideCompletenessReport: guideDoc?.completenessReport || null,
  });
});

// ─── UPDATE ELEMENT VALUE ───
projectRoutes.put("/:id/elements/:eid", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const { id, eid } = c.req.param();

  const lockErr = await requireLock(id, auth.userId);
  if (lockErr) return c.json({ error: lockErr }, 423);

  const body = updateElementSchema.parse(await c.req.json());

  // Snapshot old state for audit log
  const oldElement = await db.query.projectElements.findFirst({
    where: eq(projectElements.id, eid),
  });

  // Only update fields that are explicitly provided — avoid overwriting with undefined
  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (body.value !== undefined) updateData.value = body.value;
  if (body.source !== undefined) updateData.source = body.source;
  if (body.confirmed !== undefined) {
    updateData.confirmed = body.confirmed;
    updateData.confirmedBy = body.confirmed ? auth.userId : null;
  }

  const [updated] = await db.update(projectElements).set(updateData)
    .where(eq(projectElements.id, eid)).returning();

  // === CASCADE: Validate → Eligibility → Score → SSE ===

  // 1. Validate element
  const validation = await validateElement(eid, id);
  await db.update(projectElements).set({
    validationStatus: validation.status,
    validationDetails: validation.details,
  }).where(eq(projectElements.id, eid));

  // 2. Audit log
  if (oldElement && body.value !== undefined && oldElement.value !== body.value) {
    await logElementChange({
      projectElementId: eid,
      oldValue: oldElement.value,
      newValue: body.value,
      oldValidationStatus: oldElement.validationStatus as any,
      newValidationStatus: validation.status,
      changedBy: auth.userId,
      changeSource: (body.source || oldElement.source) as any,
    });
  }

  // 3. SSE: element validated
  const templateEl = updated.templateElementId ? await db.query.templateElements.findFirst({
    where: eq(templateElements.id, updated.templateElementId),
  }) : null;
  publishElementValidated(id, {
    elementId: eid,
    elementKey: templateEl?.key || "",
    value: updated.value,
    validationStatus: validation.status,
    message: `Element "${templateEl?.label || templateEl?.key}" → ${validation.status}`,
  });

  // 4. Re-check eligibility
  await checkEligibility(id, auth.organizationId!);

  // Get eligibility summary for SSE
  const eligibility = await db.query.projectEligibility.findMany({
    where: eq(projectEligibility.projectId, id),
  });
  publishEligibilityUpdated(id, {
    total: eligibility.length,
    passed: eligibility.filter(e => e.status === "passed").length,
    failed: eligibility.filter(e => e.status === "failed").length,
    pending: eligibility.filter(e => e.status === "pending").length,
    message: `Eligibilitate re-evaluată: ${eligibility.filter(e => e.status === "passed").length}/${eligibility.length} trecute`,
  });

  // 5. Recompute scoring
  const scoreResult = await computeProjectScores(id);
  if (scoreResult.scores.length > 0) {
    publishScoreUpdated(id, {
      totalPoints: scoreResult.totalPoints,
      maxTotalPoints: scoreResult.maxTotalPoints,
      percentage: scoreResult.percentage,
      message: `Punctaj actualizat: ${scoreResult.totalPoints}/${scoreResult.maxTotalPoints} (${scoreResult.percentage}%)`,
    });
  }

  // Return updated element with validation
  return c.json({
    ...updated,
    validationStatus: validation.status,
    validationDetails: validation.details,
  });
});

// ─── BULK CONFIRM ELEMENTS ───
projectRoutes.put("/:id/elements-bulk/confirm", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const { id } = c.req.param();

  const lockErr = await requireLock(id, auth.userId);
  if (lockErr) return c.json({ error: lockErr }, 423);

  const { elementIds } = bulkConfirmElementsSchema.parse(await c.req.json());

  const results = await Promise.all(elementIds.map(eid =>
    db.update(projectElements).set({
      confirmed: true,
      confirmedBy: auth.userId,
      updatedAt: new Date(),
    }).where(eq(projectElements.id, eid)).returning()
  ));

  return c.json({ confirmed: results.flat().length });
});

// ─── ELIGIBILITY ───
projectRoutes.get("/:id/eligibility", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  if (!await verifyProjectOwnership(id, auth.organizationId!)) {
    return c.json({ error: "Not found" }, 404);
  }

  const result = await db.query.projectEligibility.findMany({
    where: eq(projectEligibility.projectId, id),
  });

  // Enrich each rule with source document
  const enriched = await Promise.all(result.map(async (e) => {
    const rule = await db.query.rules.findFirst({
      where: eq(rules.id, e.ruleId),
    });

    const sourceDoc = rule?.documentId
      ? await db.query.documents.findFirst({ where: eq(documents.id, rule.documentId) })
      : null;

    return {
      ...e,
      rule: rule ? {
        ...rule,
        sourceDocument: sourceDoc ? {
          id: sourceDoc.id,
          name: sourceDoc.name,
          fileType: sourceDoc.fileType,
        } : null,
      } : null,
    };
  }));

  // Group by source document
  const grouped: Record<string, {
    document: { id: string; name: string; fileType: string } | null;
    rules: typeof enriched;
  }> = {};

  for (const item of enriched) {
    const docId = item.rule?.documentId || "unknown";
    if (!grouped[docId]) {
      grouped[docId] = {
        document: item.rule?.sourceDocument || null,
        rules: [],
      };
    }
    grouped[docId].rules.push(item);
  }

  // Sort: fixed → interpreted, passed → pending → failed
  const statusOrder: Record<string, number> = { passed: 0, pending: 1, failed: 2, not_applicable: 3 };
  const typeOrder: Record<string, number> = { fixed: 0, interpreted: 1 };

  for (const group of Object.values(grouped)) {
    group.rules.sort((a, b) => {
      const typeA = typeOrder[a.rule?.type || "fixed"] || 0;
      const typeB = typeOrder[b.rule?.type || "fixed"] || 0;
      if (typeA !== typeB) return typeA - typeB;
      return (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
    });
  }

  return c.json({
    flat: enriched,
    grouped: Object.values(grouped),
    summary: {
      total: enriched.length,
      fixed: enriched.filter(e => e.rule?.type === "fixed").length,
      interpreted: enriched.filter(e => e.rule?.type === "interpreted").length,
      passed: enriched.filter(e => e.status === "passed").length,
      failed: enriched.filter(e => e.status === "failed").length,
      pending: enriched.filter(e => e.status === "pending").length,
      documents: Object.keys(grouped).length,
    },
  });
});

projectRoutes.post("/:id/check-eligibility", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  if (!await verifyProjectOwnership(id, auth.organizationId!)) {
    return c.json({ error: "Not found" }, 404);
  }

  await checkEligibility(id, auth.organizationId!);

  return c.json({ ok: true });
});

// ─── OVERRIDE ELIGIBILITY RULE ───
projectRoutes.put("/:id/eligibility/:eid", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const { eid } = c.req.param();

  const lockErr = await requireLock(id, auth.userId);
  if (lockErr) return c.json({ error: lockErr }, 423);

  const body = overrideEligibilitySchema.parse(await c.req.json());

  const overrideBool = body.overrideResult === "passed" ? true : body.overrideResult === "failed" ? false : null;
  const [updated] = await db.update(projectEligibility).set({
    overrideResult: overrideBool,
    overrideBy: auth.userId,
    status: body.overrideResult === "not_applicable" ? "not_applicable" : body.overrideResult,
    notes: body.notes || null,
  }).where(eq(projectEligibility.id, eid)).returning();

  return c.json(updated);
});

// ─── SCORING ───
projectRoutes.get("/:id/scores", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  if (!await verifyProjectOwnership(id, auth.organizationId!)) {
    return c.json({ error: "Not found" }, 404);
  }

  const result = await computeProjectScores(id);
  return c.json(result);
});

projectRoutes.post("/:id/recompute-scores", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  if (!await verifyProjectOwnership(id, auth.organizationId!)) {
    return c.json({ error: "Not found" }, 404);
  }

  const result = await computeProjectScores(id);
  return c.json(result);
});

// ─── VALIDATE ALL ELEMENTS ───
projectRoutes.post("/:id/validate-all", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  if (!await verifyProjectOwnership(id, auth.organizationId!)) {
    return c.json({ error: "Not found" }, 404);
  }

  const { validateAllProjectElements } = await import("../services/elementValidation");
  const stats = await validateAllProjectElements(id);
  return c.json(stats);
});

// ─── ELEMENT AUDIT LOG ───
projectRoutes.get("/:id/elements/:eid/history", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const { eid } = c.req.param();

  if (!await verifyProjectOwnership(id, auth.organizationId!)) {
    return c.json({ error: "Not found" }, 404);
  }

  const logs = await db.select().from(elementAuditLog)
    .where(eq(elementAuditLog.projectElementId, eid))
    .orderBy(desc(elementAuditLog.changedAt));

  return c.json(logs);
});

// ─── CHECKLIST ───
projectRoutes.get("/:id/checklist", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  if (!await verifyProjectOwnership(id, auth.organizationId!)) {
    return c.json({ error: "Not found" }, 404);
  }

  const items = await db.query.projectChecklist.findMany({
    where: eq(projectChecklist.projectId, id),
    orderBy: (c, { asc }) => [asc(c.category), asc(c.sortOrder)],
  });

  // Enrich with template names
  const enriched = await Promise.all(items.map(async (item) => {
    let templateName: string | null = null;
    if (item.templateId) {
      const tmplDoc = await db.query.documents.findFirst({
        where: eq(documents.id, item.templateId),
      });
      templateName = tmplDoc?.name || null;
    }
    return { ...item, templateName };
  }));

  const totalDone = items.filter(i => i.done).length;

  // Group by category
  const grouped: Record<string, typeof enriched> = {};
  for (const item of enriched) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  return c.json({
    items: enriched,
    grouped,
    summary: { total: items.length, done: totalDone, pct: items.length > 0 ? Math.round(totalDone / items.length * 100) : 0 },
  });
});

projectRoutes.post("/:id/checklist", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const lockErr = await requireLock(id, auth.userId);
  if (lockErr) return c.json({ error: lockErr }, 423);

  const body = createChecklistItemSchema.parse(await c.req.json());

  const [item] = await db.insert(projectChecklist).values({
    projectId: id,
    name: body.name,
    category: body.category || "General",
    source: "manual",
  }).returning();

  return c.json(item, 201);
});

projectRoutes.put("/:id/checklist/:itemId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const { itemId } = c.req.param();

  const lockErr = await requireLock(id, auth.userId);
  if (lockErr) return c.json({ error: lockErr }, 423);

  const body = updateChecklistItemSchema.parse(await c.req.json());

  const updateData: any = {};
  if (body.done !== undefined) updateData.done = body.done;
  if (body.templateId !== undefined) updateData.templateId = body.templateId;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.category !== undefined) updateData.category = body.category;

  const [updated] = await db.update(projectChecklist).set(updateData)
    .where(eq(projectChecklist.id, itemId)).returning();

  return c.json(updated);
});

projectRoutes.delete("/:id/checklist/:itemId", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const { itemId } = c.req.param();

  const lockErr = await requireLock(id, auth.userId);
  if (lockErr) return c.json({ error: lockErr }, 423);

  await db.delete(projectChecklist).where(eq(projectChecklist.id, itemId));
  return c.json({ ok: true });
});

// ─── LOCK: ACQUIRE ───
projectRoutes.post("/:id/lock", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.organizationId, auth.organizationId!)),
  });
  if (!project) return c.json({ error: "Not found" }, 404);

  // Already locked by this user — just refresh
  if (project.lockedBy === auth.userId && !isLockExpired(project.lockedAt)) {
    const [updated] = await db.update(projects).set({ lockedAt: new Date() })
      .where(eq(projects.id, id)).returning();
    return c.json({ locked: true, lockedBy: auth.userId, lockedAt: updated.lockedAt });
  }

  // Locked by someone else and not expired
  if (project.lockedBy && project.lockedBy !== auth.userId && !isLockExpired(project.lockedAt)) {
    const locker = await db.query.users.findFirst({ where: eq(users.id, project.lockedBy) });
    return c.json({
      locked: false,
      error: "Proiectul este blocat",
      lockedBy: project.lockedBy,
      lockedByName: locker?.name || "Alt utilizator",
      lockedAt: project.lockedAt,
    }, 423);
  }

  // Available or expired — acquire lock
  const [updated] = await db.update(projects).set({
    lockedBy: auth.userId,
    lockedAt: new Date(),
  }).where(eq(projects.id, id)).returning();

  return c.json({ locked: true, lockedBy: auth.userId, lockedAt: updated.lockedAt });
});

// ─── LOCK: RELEASE ───
projectRoutes.delete("/:id/lock", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.organizationId, auth.organizationId!)),
  });
  if (!project) return c.json({ error: "Not found" }, 404);

  // Only lock owner or admin can release
  if (project.lockedBy !== auth.userId && auth.role !== "admin") {
    return c.json({ error: "Nu poți debloca proiectul altui utilizator" }, 403);
  }

  await db.update(projects).set({ lockedBy: null, lockedAt: null }).where(eq(projects.id, id));
  return c.json({ ok: true });
});

// ─── LOCK: HEARTBEAT (extend lock) ───
projectRoutes.post("/:id/lock/heartbeat", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.organizationId, auth.organizationId!)),
  });
  if (!project) return c.json({ error: "Not found" }, 404);

  if (project.lockedBy !== auth.userId) {
    return c.json({ error: "Lock not owned by you" }, 403);
  }

  const [updated] = await db.update(projects).set({ lockedAt: new Date() })
    .where(eq(projects.id, id)).returning();

  return c.json({ lockedAt: updated.lockedAt });
});

// ─── LOCK: RELEASE VIA SENDBEACON (POST with token in body) ───
// sendBeacon can only POST and cannot set Authorization headers,
// so the token is passed in the JSON body instead.
projectRoutes.post("/:id/lock/release", async (c) => {
  const id = c.req.param("id");

  // Try auth from middleware first (normal authenticated request)
  let userId: string | null = null;
  try {
    const auth = c.get("auth") as AuthContext;
    userId = auth.userId;
  } catch {
    // sendBeacon may not have gone through auth middleware properly
  }

  // Fallback: parse token from request body (sendBeacon path)
  if (!userId) {
    try {
      const body = await c.req.json();
      if (body.token) {
        const payload = await verify(body.token, process.env.JWT_SECRET!, "HS256");
        userId = payload.sub as string;
      }
    } catch {
      return c.json({ error: "Unauthorized" }, 401);
    }
  }

  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
    columns: { id: true, lockedBy: true },
  });
  if (!project) return c.json({ error: "Not found" }, 404);

  if (project.lockedBy !== userId) {
    return c.json({ error: "Lock not owned by you" }, 403);
  }

  await db.update(projects).set({ lockedBy: null, lockedAt: null }).where(eq(projects.id, id));
  return c.json({ ok: true });
});

// ─── LOCK: STATUS CHECK ───
projectRoutes.get("/:id/lock", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.organizationId, auth.organizationId!)),
  });
  if (!project) return c.json({ error: "Not found" }, 404);

  if (!project.lockedBy || isLockExpired(project.lockedAt)) {
    return c.json({ locked: false });
  }

  const locker = await db.query.users.findFirst({ where: eq(users.id, project.lockedBy) });
  return c.json({
    locked: true,
    lockedBy: project.lockedBy,
    lockedByName: locker?.name || "Alt utilizator",
    lockedAt: project.lockedAt,
    isOwner: project.lockedBy === auth.userId,
  });
});

// ─── DELETE PROJECT ───
projectRoutes.delete("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  if (auth.role !== "admin" && auth.role !== "consultant") {
    return c.json({ error: "Acces interzis" }, 403);
  }

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.organizationId, auth.organizationId!)),
  });
  if (!project) return c.json({ error: "Not found" }, 404);

  if (project.status === "submitted" || project.status === "approved") {
    return c.json({ error: "Proiectele depuse sau aprobate nu pot fi șterse" }, 400);
  }

  // Delete R2 files for generated documents (Neemia output)
  const generatedDocs = await db.query.projectDocuments.findMany({
    where: eq(projectDocuments.projectId, id),
  });
  for (const doc of generatedDocs) {
    if (doc.generatedFileId) {
      await deleteFile(doc.generatedFileId).catch((e: any) => console.warn("[projects] generated doc file cleanup:", e.message));
    }
  }

  // Cascade deletes handle elements, eligibility, checklist, conversations, messages, projectDocuments
  await db.delete(projects).where(eq(projects.id, id));
  return c.json({ ok: true });
});

// ─── UPDATE PROJECT ───
projectRoutes.put("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const lockErr = await requireLock(id, auth.userId);
  if (lockErr) return c.json({ error: lockErr }, 423);

  const body = updateProjectSchema.parse(await c.req.json());

  const updateData: any = { updatedAt: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.valoare !== undefined) updateData.valoare = body.valoare;
  // Program metadata fields (set by Solomon or manually by consultant)
  if (body.programFinantare !== undefined) updateData.programFinantare = body.programFinantare;
  if (body.codMasura !== undefined) updateData.codMasura = body.codMasura;
  if (body.codSesiune !== undefined) updateData.codSesiune = body.codSesiune;
  if (body.codNomenclator !== undefined) updateData.codNomenclator = body.codNomenclator;
  if (body.prefixDocumente !== undefined) updateData.prefixDocumente = body.prefixDocumente;
  if (body.codMysmis !== undefined) updateData.codMysmis = body.codMysmis;
  if (body.structuraDosar !== undefined) updateData.structuraDosar = body.structuraDosar;

  const [updated] = await db.update(projects).set(updateData).where(
    and(eq(projects.id, id), eq(projects.organizationId, auth.organizationId!))
  ).returning();

  return c.json(updated);
});

// ─── BUDGET VALIDATION ───
projectRoutes.get("/:id/budget-validation", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.organizationId, auth.organizationId!)),
  });
  if (!project) return c.json({ error: "Not found" }, 404);

  const result = await validateBudget(id);
  return c.json(result);
});

projectRoutes.post("/:id/validate-budget", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.organizationId, auth.organizationId!)),
  });
  if (!project) return c.json({ error: "Not found" }, 404);

  const result = await validateBudget(id);
  return c.json(result);
});

// ─── LEARNINGS FROM APPROVED PROJECTS ───
projectRoutes.get("/:id/learnings", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.organizationId, auth.organizationId!)),
  });
  if (!project) return c.json({ error: "Not found" }, 404);

  const learnings = await getApprovedProjectLearnings(id, auth.organizationId!);
  return c.json(learnings);
});

// ─── GHID VIEWER: guide PDF URL + rules grouped by page ───
projectRoutes.get("/:id/ghid-viewer", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.organizationId, auth.organizationId!)),
  });
  if (!project) return c.json({ error: "Not found" }, 404);

  // Find the "Ghiduri" subfolder under the project's session folder
  const ghiduriFolder = await db.query.documentFolders.findFirst({
    where: and(
      eq(documentFolders.parentId, project.folderId),
      eq(documentFolders.type, "ghiduri"),
      eq(documentFolders.organizationId, auth.organizationId!),
    ),
  });
  if (!ghiduriFolder) return c.json({ error: "No ghiduri folder found" }, 404);

  // Find all processed guide documents in this folder
  const guideDocs = await db.query.documents.findMany({
    where: and(
      eq(documents.folderId, ghiduriFolder.id),
      eq(documents.organizationId, auth.organizationId!),
      eq(documents.processingType, "ghid"),
    ),
    orderBy: (d, { desc: descFn }) => [descFn(d.uploadedAt)],
  });

  if (guideDocs.length === 0) return c.json({ error: "No guide documents found" }, 404);

  // Build response for each guide document
  const guides = await Promise.all(guideDocs.map(async (doc) => {
    // Presigned download URL
    let downloadUrl: string | null = null;
    try {
      downloadUrl = await getFileUrl(doc.fileId, auth.organizationId!);
    } catch { /* file might be missing */ }

    // Get rules for this document, ordered by page
    const docRules = await db.query.rules.findMany({
      where: and(eq(rules.documentId, doc.id), eq(rules.organizationId, auth.organizationId!)),
      orderBy: (r, { asc: ascFn }) => [ascFn(r.sourcePage), ascFn(r.createdAt)],
    });

    // Get scoring criteria for this document
    const docScoring = await db.query.scoringCriteria.findMany({
      where: and(eq(scoringCriteria.documentId, doc.id), eq(scoringCriteria.organizationId, auth.organizationId!)),
      orderBy: (s, { asc: ascFn }) => [ascFn(s.sourcePage), ascFn(s.sortOrder)],
    });

    // Group rules by page
    const rulesByPage: Record<number, typeof docRules> = {};
    for (const rule of docRules) {
      const page = rule.sourcePage || 0;
      if (!rulesByPage[page]) rulesByPage[page] = [];
      rulesByPage[page].push(rule);
    }

    return {
      id: doc.id,
      name: doc.name,
      fileType: doc.fileType,
      pageCount: doc.pageCount,
      status: doc.status,
      downloadUrl,
      totalRules: docRules.length,
      totalScoring: docScoring.length,
      rules: docRules,
      scoringCriteria: docScoring,
      rulesByPage,
    };
  }));

  return c.json({ projectId: id, guides });
});
