import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import {
  projects, projectElements, projectEligibility, projectDocuments,
  projectChecklist, templateElements, rules, companies, companyFinancials,
  documentFolders, documents, auditLog, orgConfig, users,
} from "../db/schema";
import { eq, and, count, asc, desc, sql } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";
import { checkEligibility } from "../services/eligibility";

export const projectRoutes = new Hono();

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

  // Enrich with progress stats
  const enriched = await Promise.all(result.map(async (p) => {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, p.companyId),
    });

    // Elements completed
    const elements = await db.query.projectElements.findMany({
      where: eq(projectElements.projectId, p.id),
    });
    const totalElements = elements.length;
    const filledElements = elements.filter(e => e.value && e.value.trim() !== "").length;
    const confirmedElements = elements.filter(e => e.confirmed).length;

    // Eligibility
    const eligibility = await db.query.projectEligibility.findMany({
      where: eq(projectEligibility.projectId, p.id),
    });
    const totalElig = eligibility.length;
    const passedElig = eligibility.filter(e => e.status === "passed").length;

    // Generated docs
    const generatedDocs = await db.query.projectDocuments.findMany({
      where: eq(projectDocuments.projectId, p.id),
    });
    const totalDocs = generatedDocs.length;
    const doneDocs = generatedDocs.filter(d => d.status === "generated" || d.status === "validated").length;

    // Templates done
    const templateDocs = await getProjectTemplates(p.folderId, auth.organizationId!);
    const totalTemplates = templateDocs.length;
    const doneTemplates = generatedDocs.filter(d => d.status === "validated").length;

    const programPath = await buildProgramPath(p.folderId);

    // Lock info
    const lockActive = p.lockedBy && !isLockExpired(p.lockedAt);
    let lockedByName: string | null = null;
    if (lockActive && p.lockedBy) {
      const locker = await db.query.users.findFirst({ where: eq(users.id, p.lockedBy) });
      lockedByName = locker?.name || null;
    }

    return {
      ...p,
      company: company ? { denumire: company.denumire, cui: company.cui } : null,
      programPath,
      lock: lockActive ? { lockedBy: p.lockedBy, lockedByName, lockedAt: p.lockedAt } : null,
      progress: {
        eligibility: { passed: passedElig, total: totalElig },
        elements: { filled: filledElements, total: totalElements, confirmed: confirmedElements },
        docs: { done: doneDocs, total: totalDocs },
        templates: { done: doneTemplates, total: totalTemplates },
      },
    };
  }));

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

  const [project] = await db.insert(projects).values({
    organizationId: auth.organizationId,
    companyId: body.companyId,
    folderId: body.folderId,
    name: body.name,
    status: "draft",
    consultantId: auth.userId,
  }).returning();

  // Copy template elements as project elements
  const templateDocs = await getProjectTemplates(body.folderId, auth.organizationId);
  for (const doc of templateDocs) {
    const elements = await db.query.templateElements.findMany({
      where: eq(templateElements.documentId, doc.id),
    });

    if (elements.length > 0) {
      await db.insert(projectElements).values(
        elements.map(el => ({
          projectId: project.id,
          templateElementId: el.id,
          value: null,
          source: "manual" as const,
          confirmed: false,
        }))
      );
    }
  }

  // Pre-fill from company data (ONRC)
  await prefillFromCompany(project.id, company);

  // Populate checklist from guide rules
  await populateChecklistFromRules(project.id, project.folderId, auth.organizationId);

  // Run pre-eligibility check
  await checkEligibility(project.id, auth.organizationId);

  return c.json(project, 201);
});

// Pre-fill fields from ONRC
async function prefillFromCompany(projectId: string, company: any) {
  const elements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  // Get template element keys for each project element
  for (const el of elements) {
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

  // Enrich elements with template element data
  const enrichedElements = await Promise.all(elements.map(async (el) => {
    const templateEl = await db.query.templateElements.findFirst({
      where: eq(templateElements.id, el.templateElementId),
    });
    return { ...el, templateElement: templateEl };
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

  return c.json({
    ...project,
    company,
    folder,
    programPath,
    elements: enrichedElements,
    eligibility,
    generatedDocs,
    checklist,
  });
});

// ─── UPDATE ELEMENT VALUE ───
projectRoutes.put("/:id/elements/:eid", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const { id, eid } = c.req.param();

  const lockErr = await requireLock(id, auth.userId);
  if (lockErr) return c.json({ error: lockErr }, 423);

  const body = await c.req.json();

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

  // Re-check eligibility if relevant value changed
  await checkEligibility(id, auth.organizationId!);

  return c.json(updated);
});

// ─── BULK CONFIRM ELEMENTS ───
projectRoutes.put("/:id/elements-bulk/confirm", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const { id } = c.req.param();

  const lockErr = await requireLock(id, auth.userId);
  if (lockErr) return c.json({ error: lockErr }, 423);

  const { elementIds } = await c.req.json<{ elementIds: string[] }>();
  if (!elementIds || !Array.isArray(elementIds) || elementIds.length === 0) {
    return c.json({ error: "elementIds required" }, 400);
  }

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

  const body = await c.req.json();

  const [updated] = await db.update(projectEligibility).set({
    overrideResult: body.overrideResult,
    overrideBy: auth.userId,
    status: body.overrideResult === true ? "passed" : body.overrideResult === false ? "failed" : "pending",
    notes: body.notes || null,
  }).where(eq(projectEligibility.id, eid)).returning();

  return c.json(updated);
});

// ─── CHECKLIST ───
projectRoutes.get("/:id/checklist", async (c) => {
  const id = c.req.param("id");

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
  const id = c.req.param("id");
  const body = await c.req.json();

  const [item] = await db.insert(projectChecklist).values({
    projectId: id,
    name: body.name,
    category: body.category,
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

  const body = await c.req.json();

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
  const { itemId } = c.req.param();
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

  await db.delete(projects).where(eq(projects.id, id));
  return c.json({ ok: true });
});

// ─── UPDATE PROJECT ───
projectRoutes.put("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const lockErr = await requireLock(id, auth.userId);
  if (lockErr) return c.json({ error: lockErr }, 423);

  const body = await c.req.json();

  const updateData: any = { updatedAt: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.valoare !== undefined) updateData.valoare = body.valoare;

  const [updated] = await db.update(projects).set(updateData).where(
    and(eq(projects.id, id), eq(projects.organizationId, auth.organizationId!))
  ).returning();

  return c.json(updated);
});
