# FAZA 4 — Proiecte & Eligibilitate
## CRUD Proiecte, Pre-eligibilitate Automată, Dashboard Proiect

**Dependențe**: Faza 3 completă (Reguli, Template Elements)

---

## 4.1 ROUTES PROIECTE

```typescript
// apps/api/src/routes/projects.ts
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import {
  projects, projectElements, projectEligibility, projectDocuments,
  templateElements, rules, companies, documentFolders, documents,
} from "../db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";
import { checkEligibility } from "../services/eligibility";

export const projectRoutes = new Hono();

// ─── LISTA PROIECTE ───
projectRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (!auth.organizationId) return c.json({ error: "No organization" }, 403);

  const status = c.req.query("status");
  const program = c.req.query("program");

  let query = db.query.projects.findMany({
    where: eq(projects.organizationId, auth.organizationId),
    with: {
      company: { columns: { denumire: true, cui: true } },
      folder: { columns: { name: true, parentId: true } },
    },
    orderBy: (p, { desc }) => [desc(p.updatedAt)],
  });

  const result = await query;

  // Enrich cu progress stats
  const enriched = await Promise.all(result.map(async (p) => {
    // Elemente completate
    const elements = await db.query.projectElements.findMany({
      where: eq(projectElements.projectId, p.id),
    });
    const totalElements = elements.length;
    const filledElements = elements.filter(e => e.value && e.value.trim() !== "").length;
    const confirmedElements = elements.filter(e => e.confirmed).length;

    // Eligibilitate
    const eligibility = await db.query.projectEligibility.findMany({
      where: eq(projectEligibility.projectId, p.id),
    });
    const totalElig = eligibility.length;
    const passedElig = eligibility.filter(e => e.status === "passed").length;

    // Documente generate
    const generatedDocs = await db.query.projectDocuments.findMany({
      where: eq(projectDocuments.projectId, p.id),
    });
    const totalDocs = generatedDocs.length;
    const doneDocs = generatedDocs.filter(d => d.status === "generated" || d.status === "validated").length;

    // Template-uri completate
    const templateDocs = await getProjectTemplates(p.folderId, auth.organizationId!);
    const totalTemplates = templateDocs.length;
    const doneTemplates = generatedDocs.filter(d => d.status === "validated").length;

    // Construiește path program
    const programPath = await buildProgramPath(p.folderId);

    return {
      ...p,
      programPath,
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

// Helper: construiește path program (Sesiune → Măsură → Program)
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

// Helper: obține template-uri din sesiune
async function getProjectTemplates(folderId: string, orgId: string) {
  // Găsește folder-ul "templateuri" sub sesiunea proiectului
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

// ─── CREARE PROIECT ───
const createSchema = z.object({
  name: z.string().min(3),
  companyId: z.string().uuid(),
  folderId: z.string().uuid(), // sesiunea selectată
});

projectRoutes.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const body = createSchema.parse(await c.req.json());

  // Verifică firma
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, body.companyId), eq(companies.organizationId, auth.organizationId!)),
  });
  if (!company) return c.json({ error: "Firma nu a fost găsită" }, 404);

  // Verifică folder (sesiune)
  const folder = await db.query.documentFolders.findFirst({
    where: and(eq(documentFolders.id, body.folderId), eq(documentFolders.organizationId, auth.organizationId!)),
  });
  if (!folder) return c.json({ error: "Sesiunea nu a fost găsită" }, 404);

  // Creează proiectul
  const [project] = await db.insert(projects).values({
    organizationId: auth.organizationId!,
    companyId: body.companyId,
    folderId: body.folderId,
    name: body.name,
    status: "draft",
    consultantId: auth.userId,
  }).returning();

  // Preia elementele din template-urile sesiunii și creează project_elements goale
  const templateDocs = await getProjectTemplates(body.folderId, auth.organizationId!);
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

  // Pre-populează câmpuri din date firmă (ONRC)
  await prefillFromCompany(project.id, company);

  // Rulează pre-eligibilitate
  await checkEligibility(project.id, auth.organizationId!);

  return c.json(project, 201);
});

// Pre-populare câmpuri din ONRC
async function prefillFromCompany(projectId: string, company: any) {
  const elements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
    with: { templateElement: true },
  });

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

  for (const el of elements) {
    const key = el.templateElement?.key;
    if (key && onrcMapping[key]) {
      await db.update(projectElements).set({
        value: onrcMapping[key],
        source: "onrc",
      }).where(eq(projectElements.id, el.id));
    }
  }
}

// ─── DETALII PROIECT ───
projectRoutes.get("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.organizationId, auth.organizationId!)),
    with: { company: true, folder: true },
  });
  if (!project) return c.json({ error: "Not found" }, 404);

  const elements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, id),
    with: { templateElement: true },
    orderBy: (e, { asc }) => [asc(e.templateElement.pageNum), asc(e.templateElement.lineNum)],
  });

  const eligibility = await db.query.projectEligibility.findMany({
    where: eq(projectEligibility.projectId, id),
    with: { rule: true },
  });

  const generatedDocs = await db.query.projectDocuments.findMany({
    where: eq(projectDocuments.projectId, id),
  });

  const programPath = await buildProgramPath(project.folderId);

  return c.json({
    ...project,
    programPath,
    elements,
    eligibility,
    generatedDocs,
  });
});

// ─── UPDATE ELEMENT VALOARE ───
projectRoutes.put("/:id/elements/:eid", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const { id, eid } = c.req.param();
  const body = await c.req.json();

  const [updated] = await db.update(projectElements).set({
    value: body.value,
    source: body.source || "manual",
    confirmed: body.confirmed ?? false,
    confirmedBy: body.confirmed ? auth.userId : null,
    updatedAt: new Date(),
  }).where(eq(projectElements.id, eid)).returning();

  // Re-check eligibilitate dacă valoare relevantă
  await checkEligibility(id, auth.organizationId!);

  return c.json(updated);
});

// ─── ELIGIBILITATE ───
projectRoutes.get("/:id/eligibility", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");

  const result = await db.query.projectEligibility.findMany({
    where: eq(projectEligibility.projectId, id),
    with: { rule: true },
  });

  // Enrich fiecare regulă cu documentul sursă (ghidul din care provine)
  const enriched = await Promise.all(result.map(async (e) => {
    const sourceDoc = e.rule?.documentId
      ? await db.query.documents.findFirst({ where: eq(documents.id, e.rule.documentId) })
      : null;

    return {
      ...e,
      rule: {
        ...e.rule,
        sourceDocument: sourceDoc ? {
          id: sourceDoc.id,
          name: sourceDoc.name,
          fileType: sourceDoc.fileType,
        } : null,
      },
    };
  }));

  // Grupare pe document sursă (pentru UI)
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

  // Sortare: fixe → interpretate, passed → pending → failed
  const statusOrder = { passed: 0, pending: 1, failed: 2, not_applicable: 3 };
  const typeOrder = { fixed: 0, interpreted: 1 };

  for (const group of Object.values(grouped)) {
    group.rules.sort((a, b) => {
      const typeA = typeOrder[(a.rule?.type as keyof typeof typeOrder) || "fixed"] || 0;
      const typeB = typeOrder[(b.rule?.type as keyof typeof typeOrder) || "fixed"] || 0;
      if (typeA !== typeB) return typeA - typeB;
      return (statusOrder[a.status as keyof typeof statusOrder] || 0) - (statusOrder[b.status as keyof typeof statusOrder] || 0);
    });
  }

  return c.json({
    flat: enriched, // lista plată pentru compatibilitate
    grouped: Object.values(grouped), // grupat pe document pentru UI
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

// ─── ȘTERGERE PROIECT ───
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

  // Proiecte depuse/aprobate nu se șterg
  if (project.status === "submitted" || project.status === "approved") {
    return c.json({ error: "Proiectele depuse sau aprobate nu pot fi șterse" }, 400);
  }

  await db.delete(projects).where(eq(projects.id, id));
  return c.json({ ok: true });
});

// ─── UPDATE STATUS ───
projectRoutes.put("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const id = c.req.param("id");
  const body = await c.req.json();

  const [updated] = await db.update(projects).set({
    ...body,
    updatedAt: new Date(),
  }).where(
    and(eq(projects.id, id), eq(projects.organizationId, auth.organizationId!))
  ).returning();

  return c.json(updated);
});
```

---

## 4.2 SERVICE ELIGIBILITATE

```typescript
// apps/api/src/services/eligibility.ts
import { db } from "../db";
import {
  projects, projectEligibility, rules, companies, companyFinancials,
  documentFolders, documents, orgConfig,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { logAIUsage } from "./aiUsage";

const anthropic = new Anthropic();

export async function checkEligibility(projectId: string, organizationId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: { company: true },
  });
  if (!project || !project.company) return;

  // Găsește TOATE folderele ghiduri din sesiunea proiectului
  const sessionFolders = await db.query.documentFolders.findMany({
    where: and(
      eq(documentFolders.parentId, project.folderId),
      eq(documentFolders.type, "ghiduri"),
    ),
  });

  // Preia TOATE regulile (fixe + interpretate) din TOATE ghidurile sesiunii
  const allRules: Array<typeof rules.$inferSelect & { documentName: string; documentFileType: string }> = [];
  for (const folder of sessionFolders) {
    const docs = await db.query.documents.findMany({
      where: eq(documents.folderId, folder.id),
    });
    for (const doc of docs) {
      const docRules = await db.query.rules.findMany({
        where: eq(rules.documentId, doc.id),
        // NU filtrăm pe type — luăm TOATE (fixed + interpreted)
      });
      allRules.push(...docRules.map(r => ({
        ...r,
        documentName: doc.name,
        documentFileType: doc.fileType,
      })));
    }
  }

  // Preia date firmă + financiare
  const company = project.company;
  const latestFinancial = await db.query.companyFinancials.findFirst({
    where: eq(companyFinancials.companyId, company.id),
    orderBy: (f, { desc }) => [desc(f.year)],
  });

  // Date pentru verificare automată (reguli fixe)
  const companyData: Record<string, any> = {
    forma_juridica: company.formaJuridica,
    cui: company.cui,
    cod_caen: company.caen,
    stare: company.stare,
    an_infiintare: company.anInfiintare,
    vechime_ani: new Date().getFullYear() - (company.anInfiintare || 2020),
    capital_social: parseFloat(company.capitalSocial?.toString() || "0"),
    angajati: latestFinancial?.f30?.numarMediuSalariati || 0,
    cifra_afaceri: latestFinancial?.f20?.cifraAfaceriNeta || 0,
    profit_net: latestFinancial?.f20?.profitNet || 0,
    capitaluri_proprii: latestFinancial?.f10?.capitaluriProprii || 0,
    judet: company.judet,
    localitate: company.localitate,
  };

  // Preia toate datele financiare (nu doar ultimul an)
  const allFinancials = await db.query.companyFinancials.findMany({
    where: eq(companyFinancials.companyId, company.id),
    orderBy: (f, { desc }) => [desc(f.year)],
  });

  // Șterge eligibilitate veche
  await db.delete(projectEligibility).where(eq(projectEligibility.projectId, projectId));

  // ═══ PASUL 1: VERIFICARE REGULI FIXE (automat, fără AI) ═══
  const results: Array<{
    ruleId: string;
    status: "passed" | "failed" | "pending" | "not_applicable";
    autoResult: boolean | null;
    notes: string | null;
  }> = [];

  const fixedRules = allRules.filter(r => r.type === "fixed");
  const interpretedRules = allRules.filter(r => r.type === "interpreted");

  for (const rule of fixedRules) {
    const condition = rule.condition as any;
    if (!condition || !condition.field) {
      results.push({ ruleId: rule.id, status: "not_applicable", autoResult: null, notes: null });
      continue;
    }

    const fieldValue = companyData[condition.field];
    if (fieldValue === undefined || fieldValue === null) {
      results.push({ ruleId: rule.id, status: "pending", autoResult: null, notes: "Date lipsă: " + condition.field });
      continue;
    }

    let passed = false;
    const compareValue = parseFloat(condition.value) || condition.value;

    switch (condition.operator) {
      case "eq": passed = fieldValue == compareValue; break;
      case "neq": passed = fieldValue != compareValue; break;
      case "gt": passed = fieldValue > compareValue; break;
      case "gte": passed = fieldValue >= compareValue; break;
      case "lt": passed = fieldValue < compareValue; break;
      case "lte": passed = fieldValue <= compareValue; break;
      case "in":
        const inValues = Array.isArray(condition.value) ? condition.value : condition.value.split(",").map((v: string) => v.trim());
        passed = inValues.includes(String(fieldValue));
        break;
      case "not_in":
        const notInValues = Array.isArray(condition.value) ? condition.value : condition.value.split(",").map((v: string) => v.trim());
        passed = !notInValues.includes(String(fieldValue));
        break;
      case "between":
        const low = parseFloat(condition.value);
        const high = parseFloat(condition.value2);
        passed = fieldValue >= low && fieldValue <= high;
        break;
      default:
        results.push({ ruleId: rule.id, status: "pending", autoResult: null, notes: "Operator necunoscut: " + condition.operator });
        continue;
    }

    results.push({
      ruleId: rule.id,
      status: passed ? "passed" : "failed",
      autoResult: passed,
      notes: `${condition.field}: ${fieldValue} ${condition.operator} ${condition.value}${condition.value2 ? " - " + condition.value2 : ""}`,
    });
  }

  // ═══ PASUL 2: EVALUARE REGULI INTERPRETATE (Opus + ET) ═══
  if (interpretedRules.length > 0) {
    const interpretedResults = await evaluateInterpretedRules(
      interpretedRules,
      company,
      allFinancials,
      companyData,
      organizationId,
    );
    results.push(...interpretedResults);
  }

  // Inserare rezultate
  if (results.length > 0) {
    await db.insert(projectEligibility).values(
      results.map(r => ({
        projectId,
        ruleId: r.ruleId,
        status: r.status,
        autoResult: r.autoResult,
        notes: r.notes,
      }))
    );
  }
}

// ═══ EVALUARE REGULI INTERPRETATE CU OPUS + ET ═══
async function evaluateInterpretedRules(
  interpretedRules: any[],
  company: any,
  allFinancials: any[],
  companyData: Record<string, any>,
  organizationId: string,
): Promise<Array<{
  ruleId: string;
  status: "passed" | "failed" | "pending";
  autoResult: boolean | null;
  notes: string | null;
}>> {
  // Get org config for model
  const config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, organizationId),
  });
  const model = config?.reguliInterpModel || "claude-opus-4-6";
  const useET = config?.reguliInterpET ?? true;

  // Construiește contextul complet al firmei
  const companyContext = `
FIRMĂ: ${company.denumire}
CUI: ${company.cui} | Reg. Com: ${company.regCom}
Forma juridică: ${company.formaJuridica}
Stare: ${company.stare}
An înființare: ${company.anInfiintare} (vechime: ${companyData.vechime_ani} ani)
CAEN principal: ${company.caen || "nespecificat"}
Județ: ${company.judet} | Localitate: ${company.localitate}
Capital social: ${company.capitalSocial} ${company.moneda || "LEI"}
Părți sociale: ${company.partiSociale}

SITUAȚII FINANCIARE:
${allFinancials.map(f => {
  const f20 = f.f20 || {};
  const f10 = f.f10 || {};
  const f30 = f.f30 || {};
  return `  ${f.year}: CA=${f20.cifraAfaceriNeta || "?"} | Profit brut=${f20.profitBrut || "?"} | Profit net=${f20.profitNet || "?"} | Angajați=${f30.numarMediuSalariati || "?"} | Cap. proprii=${f10.capitaluriProprii || "?"} | Active imob.=${f10.activeImobilizate?.total || "?"} | Active circ.=${f10.activeCirculante?.total || "?"}`;
}).join("\n")}
`;

  // Construiește lista regulilor de evaluat
  const rulesForEval = interpretedRules.map((r, idx) => ({
    index: idx,
    id: r.id,
    category: r.category,
    description: r.description,
    condition: r.condition,
    sourceText: r.sourceText,
    sourcePage: r.sourcePage,
    confidence: r.confidence,
  }));

  // Batch call — toate regulile interpretate într-un singur request
  const requestParams: any = {
    model,
    max_tokens: 8000,
    system: `Ești expert senior în fonduri europene cu 15+ ani experiență. Evaluezi reguli de eligibilitate interpretate contra datelor reale ale unei firme.

INSTRUCȚIUNI:
1. Pentru fiecare regulă, analizează dacă firma ÎNDEPLINEȘTE condiția
2. Unele reguli necesită raționament complex (arbori decizionali, criterii cumulative, interpretare contextuală)
3. Dacă nu ai date suficiente pentru a evalua, marchează "pending" cu motivul
4. Dacă regula nu se aplică firmei, marchează "not_applicable"
5. Fii CONSERVATOR — dacă ai dubii, marchează "pending" cu explicația

RETURNEAZĂ DOAR JSON valid — array de obiecte, fără backticks, fără explicații.`,
    messages: [{
      role: "user",
      content: `Evaluează aceste reguli interpretate contra datelor firmei.

${companyContext}

REGULI DE EVALUAT:
${JSON.stringify(rulesForEval, null, 2)}

Pentru fiecare regulă returnează:
[
  {
    "index": 0,
    "result": "passed" | "failed" | "pending",
    "reasoning": "Explicație detaliată a raționamentului (2-3 propoziții)",
    "confidence": 0.0 - 1.0,
    "missing_data": null | "ce date ar mai fi necesare"
  }
]`
    }],
  };

  if (useET) {
    requestParams.thinking = { type: "enabled", budget_tokens: 15000 };
  }

  try {
    const response = await anthropic.messages.create(requestParams);

    // Extrage text (skip thinking blocks)
    const textBlock = response.content.find((b: any) => b.type === "text");
    const content = textBlock ? (textBlock as any).text : "[]";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const evaluations = JSON.parse(cleaned);

    // Log AI usage
    await logAIUsage({
      organizationId,
      agent: "ghid_rules",
      model,
      tokensInput: response.usage.input_tokens,
      tokensOutput: response.usage.output_tokens,
      action: "evaluate_interpreted_rules",
    });

    // Map results
    return interpretedRules.map((rule, idx) => {
      const eval_ = evaluations.find((e: any) => e.index === idx);
      if (!eval_) {
        return { ruleId: rule.id, status: "pending" as const, autoResult: null, notes: "Evaluare eșuată" };
      }

      const reviewThreshold = parseFloat(config?.reviewThreshold?.toString() || "0.85");
      const needsReview = eval_.confidence < reviewThreshold;

      return {
        ruleId: rule.id,
        status: needsReview ? "pending" as const : (eval_.result as "passed" | "failed" | "pending"),
        autoResult: eval_.result === "passed" ? true : eval_.result === "failed" ? false : null,
        notes: `[AI ${(eval_.confidence * 100).toFixed(0)}%] ${eval_.reasoning}${eval_.missing_data ? ` | Date lipsă: ${eval_.missing_data}` : ""}${needsReview ? " | ⚠️ Sub pragul de review — necesită confirmare consultant" : ""}`,
      };
    });
  } catch (error) {
    console.error("Interpreted rules evaluation failed:", error);
    // Fallback: toate pending dacă AI fail
    return interpretedRules.map(rule => ({
      ruleId: rule.id,
      status: "pending" as const,
      autoResult: null,
      notes: "Evaluare AI eșuată — verificare manuală necesară",
    }));
  }
}
```

---

## 4.3 FRONTEND: LISTA PROIECTE

### Referință UI: `05_Proiecte.jsx`

**Componente:**
- Stats pills (Total, Ciornă, În lucru, Verificare, Depus) cu counters
- Toolbar: search + filtru program + toggle carduri/tabel
- Card view: nume, firmă, program path, valoare, status badge, 4 bare progres (eligibilitate, elemente, documente, template-uri), consultant, timestamp
- Table view: coloane cu mini progress bars
- Modal creare: wizard 3 pași (firmă → program/sesiune → nume + confirmare)

**API calls:**
```
GET  /api/projects                    → lista cu progress enriched
POST /api/projects                    → creare
GET  /api/projects/:id                → detalii complet
PUT  /api/projects/:id                → update status/detalii
DELETE /api/projects/:id              → ștergere (cu confirmare)
POST /api/projects/:id/check-eligibility → re-verificare
```

---

## 4.4 FRONTEND: PROJECT VIEW (Detalii proiect)

### Rută: `/projects/[id]`
### Referință UI: `05b_ProjectView.jsx`

### NAVIGARE: SIDEBAR ARBORE (nu tab-uri!)

ProjectView folosește **sidebar arbore** (tree nav, 260px stânga) din prototip, NU tab-uri orizontale.

```
┌───────────────────────────┬──────────────────────────────┐
│  SIDEBAR ARBORE (260px)   │  CONȚINUT PRINCIPAL          │
│                           │                              │
│  PROIECT                  │  [depinde de selecția din     │
│  "Modernizare fabrică"    │   arbore — activeLeaf state]  │
│  COMEXIM R SRL · 2146135  │                              │
│                           │                              │
│  📋 Sumar                 │                              │
│  ▼ Scriere proiect        │                              │
│    🛡 Eligibilitate 12/13 │                              │
│    📖 Ghid Finanțare   8  │                              │
│    🤖 Solomon       Opus  │                              │
│    📊 Elemente      14/18 │                              │
│    📋 Checklist doc  5/17 │                              │
│    📄 Neemia         1/3  │                              │
│  ▶ Implementare     TBD   │                              │
│  ▶ Monitorizare     TBD   │                              │
│                           │                              │
│  🗑 Șterge proiect        │                              │
│  (doar admin)             │                              │
└───────────────────────────┴──────────────────────────────┘
```

Componente tree: `TreeBranch` (collapsible, cu icon + label + badge) și `TreeLeaf` (cu icon + label + badge progress). Badge-urile se actualizează live (ex: Solomon extrage 2 elemente → Elemente badge devine 16/18).

### SECȚIUNEA 1: SUMAR

Referință: secțiune nouă (nu există în prototip — de creat pe baza card-urilor din 05_Proiecte.jsx)

**Layout:** pagină scroll, max-width 900px

**Conținut:**
- **Header:** nume proiect, firmă, program path (● Program › Măsură › Sesiune), status badge cu dropdown
- **4 progress bars:** Eligibilitate (X/Y), Elemente (X/Y), Checklist doc (X/Y), Neemia (X/Y)
- **Date firmă rezumat:** CUI, formă juridică, CAEN, localitate, capital social, CA ultimul an
- **Acțiuni rapide:** → Verifică eligibilitate, → Deschide Solomon, → Generează documente
- **Timeline ultime acțiuni:** ultimele 5 acțiuni pe proiect (element extras, regulă verificată, doc generat)

**API:** `GET /api/projects/:id` (deja existent, returnează toate datele enriched)

### SECȚIUNEA 2: ELIGIBILITATE

Referință: prototip `EligibilityView` din 05b_ProjectView.jsx + SPEC eligibilitate AI

**Layout:** pagină scroll, max-width 900px

**Conținut:**
- **Summary cards:** Trecute (verde), Eșuate (roșu), Pending (galben), Total
- **Grupare pe document sursă:** header per ghid (📄 icon format + nume + "X reguli, Y verificate")
- **Reguli fixe** (⚡): verificate automat → ✅/❌/⏳ cu detaliu (ex: `cifra_afaceri: 33.8M ≥ 500K`)
- **Reguli interpretate** (🧠): evaluate de **Opus + ET** → status + confidence % + raționament AI
  - Sub prag (default 85%) → badge ⚠️ "necesită confirmare"
  - Notes vizibil: "[AI 92%] Firma îndeplinește criteriul de viabilitate economică..."
- **Override:** click pe regulă → consultant suprascrie cu notă
- **Filtre:** Toate / Fixe / Interpretate / Failed / Pending / Sub prag
- **Link cross:** fiecare regulă are "📖 Vezi în ghid →" care navighează la Ghid Finanțare cu regula highlighted

**API:** `GET /api/projects/:id/eligibility` (deja implementat cu groupare + summary + document sursă)

### SECȚIUNEA 3: GHID FINANȚARE

Referință: prototip `GhidFinantareView` din 05b_ProjectView.jsx

**Layout:** split view full-height cu sub-tabs

**Sub-tab "Reguli":**
- **Panel stânga (400px):** lista reguli cu:
  - Badge tip: `FIXĂ` (verde) / `INTERPRETATĂ` (portocaliu)
  - Text regulă
  - Meta: pagina + confidence bar + % + badge ⚠️ review dacă < prag
  - Click/hover → highlight în PDF viewer
- **Panel dreapta:** PDF viewer mock cu:
  - Pagina ghidului cu secțiunea regulii
  - Highlight animat (pulse albastru) pe textul exact al regulii
  - Număr pagină bottom-right

**Sub-tab "Ghid complet":**
- PDF viewer full-width cu navigare pagini

**API:**
```typescript
// Route nouă pentru Ghid Viewer
projectRoutes.get("/:id/ghid-viewer", async (c) => {
  // Returnează textul ghidului extras per pagină + regulile cu sourcePage
  const project = await getProjectWithSession(id);
  const guideDocuments = await getGuideDocuments(project.folderId);

  return c.json({
    documents: guideDocuments.map(doc => ({
      id: doc.id,
      name: doc.name,
      fileType: doc.fileType,
      pageCount: doc.pageCount,
      downloadUrl: getPresignedUrl(doc.fileId),
    })),
    rules: allRules.map(rule => ({
      ...rule,
      sourcePage: rule.sourcePage,
      sourceSection: rule.sourceSection,
      sourceText: rule.sourceText,
    })),
  });
});
```

### SECȚIUNEA 4: SOLOMON

Referință: prototip `SolomonView` din 05b_ProjectView.jsx + FAZA_5 complet

**Layout:** full-height chat (detaliat în FAZA_5 actualizat)

### SECȚIUNEA 5: ELEMENTE

Referință: prototip `ElementeView` din 05b_ProjectView.jsx

**Layout:** split view — lista stânga + detail panel dreapta

**Panel stânga:**
- **Summary bar:** progress ring/bar + "14 confirmate / 4 propuse AI / 2 goale = 20 total"
- **Search** + filtre: Toate / Gol / Propus AI / Confirmat
- **Lista carduri element:** fiecare cu:
  - Key (`general.NumeSolicitant`) mono
  - Label ("Nume solicitant")
  - Valoare (sau "— necompletat —" roșu italic)
  - Source dot colorat (🔵 Solomon / 🟢 ONRC / 🟡 Manual / 🟣 Document)
  - Status badge: `Confirmat` verde / `Propus AI` albastru / `Gol` gri

**Panel dreapta (detail, 350px):** (apare la click pe element)
- Key + Label + Status badge
- **Valoare curentă** — box editabil
- **Sursă:** icon + "Extras de Solomon din conversația X" / "ONRC auto" / "Upload CI.pdf"
- **Buton Confirmă** (dacă propus AI) / **Editează** (dacă confirmat)
- **Istoric modificări:** timeline cu:
  - "🤖 Solomon a propus «COMEXIM R SRL» — acum 2h"
  - "✅ Ion Popescu a confirmat — acum 1h"
  - "✏️ Ion Popescu a editat «COMEXIM R S.R.L.» → «COMEXIM R SRL» — acum 30min"

**API:** `GET /api/projects/:id/elements` (deja existent) + `PUT /api/projects/:id/elements/:elementId` (confirm/edit)

### SECȚIUNEA 6: CHECKLIST DOCUMENTE

Referință: prototip `ChecklistView` din 05b_ProjectView.jsx

**Layout:** pagină scroll cu progress ring central

**Conținut:**
- **Progress ring SVG** central: X% complet (Y/Z documente bifate)
- **Grupare pe categorii:** (collapsible per categorie)
  - "Acte firmă" (certificat înregistrare, act constitutiv, etc.)
  - "Documente financiare" (bilanț, balanță, etc.)
  - "Documente proiect" (plan afaceri, deviz, oferte)
  - "Alte documente" (declarații, CV-uri, etc.)
- **Fiecare document:**
  - Checkbox done/undone
  - Nume document
  - Badge sursă: `ghid` (extras automat din reguli) / `manual` (adăugat de consultant)
  - **Template mapat** → link "📄 Cerere Finanțare (DOCX)" → click navighează la Neemia
  - Acțiuni: mapează template, mută categorie, șterge
- **Adaugă document** — input + select categorie
- **Warning:** "⚠️ 2 template-uri nemapate" dacă există template-uri fără document asociat

**API:**
```typescript
// Routes checklist documente
projectRoutes.get("/:id/checklist", async (c) => {
  const items = await db.query.projectChecklist.findMany({
    where: eq(projectChecklist.projectId, id),
    orderBy: [asc(projectChecklist.category), asc(projectChecklist.sortOrder)],
  });

  // Grupare pe categorii
  const grouped = groupBy(items, "category");
  const totalDone = items.filter(i => i.done).length;

  return c.json({
    items,
    grouped,
    summary: { total: items.length, done: totalDone, pct: Math.round(totalDone / items.length * 100) },
  });
});

projectRoutes.post("/:id/checklist", async (c) => {
  // Adaugă document manual
  const body = await c.req.json(); // { name, category }
  const [item] = await db.insert(projectChecklist).values({
    projectId: id, name: body.name, category: body.category, source: "manual",
  }).returning();
  return c.json(item, 201);
});

projectRoutes.put("/:id/checklist/:itemId", async (c) => {
  // Toggle done, map template, update
  const body = await c.req.json(); // { done?, templateId?, notes?, category? }
  const [updated] = await db.update(projectChecklist).set(body)
    .where(eq(projectChecklist.id, itemId)).returning();
  return c.json(updated);
});

projectRoutes.delete("/:id/checklist/:itemId", async (c) => {
  await db.delete(projectChecklist).where(eq(projectChecklist.id, itemId));
  return c.json({ ok: true });
});

// Auto-populare checklist din reguli ghid la creare proiect
async function populateChecklistFromRules(projectId: string, rules: any[]) {
  const checklistItems = rules
    .filter(r => r.category === "documente_necesare" || r.description?.includes("document"))
    .map((r, idx) => ({
      projectId,
      name: r.description,
      category: categorizeDocument(r), // logic: "Acte firmă" / "Documente financiare" / etc.
      source: "ghid" as const,
      sortOrder: idx,
    }));

  if (checklistItems.length > 0) {
    await db.insert(projectChecklist).values(checklistItems);
  }
}
```

### SECȚIUNEA 7: NEEMIA

Referință: prototip `NeemiaView` din 05b_ProjectView.jsx + FAZA_6 complet

**Layout:** 3 panouri (detaliat în FAZA_6 actualizat)

### CROSS-LINKS ÎNTRE SECȚIUNI

Navigarea între secțiuni se face prin `setActiveLeaf()`:

| De la | Către | Trigger |
|-------|-------|---------|
| Eligibilitate | Ghid Finanțare | Click "📖 Vezi în ghid →" pe regulă → setActiveLeaf("ghid") + setActiveRule(ruleId) |
| Checklist | Neemia | Click "📄 Generează →" pe doc cu template → setActiveLeaf("neemia") + setActiveTemplate(templateId) |
| Solomon | Elemente | Când Solomon extrage câmpuri → badge Elemente se actualizează live |
| Sumar | Orice | Click pe progress bar → navighează la secțiunea respectivă |
| Neemia | Elemente | Click "câmpuri lipsă" → setActiveLeaf("elemente") cu filtru "Gol" |

### HEADER PROIECT (în sidebar)

- Nume proiect (bold, 17px)
- Firma + CUI (mono, 12px)
- Status badge cu dropdown schimbare
- Buton ștergere (doar admin, cu confirmare "Proiectul are X elemente și Y documente")

---

## 4.5 ROUTES ADIȚIONALE PROJECTVIEW

```typescript
// Dashboard route (pentru pagina Panou / 02_Panou.jsx)
dashboardRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const orgId = auth.organizationId!;

  // KPI-uri agregate
  const projectCount = await db.select({ count: count() }).from(projects)
    .where(eq(projects.organizationId, orgId));
  const companyCount = await db.select({ count: count() }).from(companies)
    .where(eq(companies.organizationId, orgId));
  const docCount = await db.select({ count: count() }).from(documents);
  // Sesiuni deschise = foldere nivel 3 (sesiune) cu documente recente
  const openSessions = await getOpenSessions(orgId);

  // Proiecte recente (top 5, cu progress enriched)
  const recentProjects = await getRecentProjectsWithProgress(orgId, 5);

  // Feed activitate (ultimele 15 acțiuni)
  const activity = await db.query.auditLog.findMany({
    where: eq(auditLog.organizationId, orgId),
    orderBy: (a, { desc }) => [desc(a.createdAt)],
    limit: 15,
  });

  // Deadline-uri (sesiuni cu termen apropiat)
  const deadlines = await getUpcomingDeadlines(orgId);

  return c.json({
    stats: {
      projects: projectCount[0].count,
      companies: companyCount[0].count,
      documents: docCount[0].count,
      openSessions: openSessions.length,
    },
    recentProjects,
    activity,
    deadlines,
  });
});
```

---

## 4.6 CHECKLIST FAZA 4

- [ ] Route proiecte: lista cu progress enriched
- [ ] Route proiecte: creare cu wizard (firmă + sesiune + nume)
- [ ] Pre-populare câmpuri din ONRC la creare
- [ ] **Auto-populare checklist din reguli ghid la creare proiect**
- [ ] Service eligibilitate: evaluare automată reguli fixe vs date firmă (operatori)
- [ ] Service eligibilitate: evaluare reguli interpretate cu **Opus + Extended Thinking** contra datelor firmei
- [ ] Service eligibilitate: confidence threshold — sub prag → pending cu "necesită confirmare"
- [ ] Service eligibilitate: raționament AI salvat în `notes` (vizibil consultantului)
- [ ] Service eligibilitate: colectare din TOATE ghidurile sesiunii (PDF + DOCX + XLSX)
- [ ] Service eligibilitate: fallback graceful dacă AI eșuează (toate pending)
- [ ] AI Usage logging: evaluare reguli interpretate (tokens, cost, model)
- [ ] Route proiecte: detalii complet (elemente, eligibilitate, docs generate)
- [ ] Route eligibilitate: enriched cu document sursă (nume ghid, format, id)
- [ ] Route eligibilitate: răspuns grupat pe document + summary (total, passed, failed, pending)
- [ ] **Route ghid-viewer: text ghid per pagină + reguli cu sourcePage/sourceSection**
- [ ] **Routes checklist: CRUD (list, add, toggle done, map template, delete)**
- [ ] **Route dashboard: GET /api/dashboard (KPI, proiecte recente, activitate, deadline-uri)**
- [ ] Route proiecte: update element valoare + re-check eligibilitate
- [ ] Route proiecte: ștergere cu protecție (nu submitted/approved)
- [ ] Frontend: lista proiecte (05_Proiecte.jsx referință)
- [ ] Frontend: modal creare wizard 3 pași
- [ ] **Frontend: ProjectView cu SIDEBAR ARBORE (05b_ProjectView.jsx referință)**
- [ ] **Frontend: Sumar — overview cu progress bars, date firmă, acțiuni rapide**
- [ ] Frontend: eligibilitate view grupată pe document sursă (icon format + nume ghid)
- [ ] Frontend: reguli fixe (⚡ auto-checked) + interpretate (🧠 AI-evaluated) cu status vizual distinct
- [ ] Frontend: afișare raționament AI pe reguli interpretate (confidence % + explicație)
- [ ] Frontend: badge ⚠️ "Sub prag review" pe reguli cu confidence scăzut
- [ ] Frontend: filtru reguli pe tip (fixe/interpretate), status, document sursă, sub prag
- [ ] Frontend: override manual pe fiecare regulă cu notă
- [ ] **Frontend: Ghid Finanțare — split: reguli stânga + PDF viewer dreapta cu highlight**
- [ ] **Frontend: Elemente — split: lista stânga (search + filtre + carduri) + detail panel dreapta (valoare + sursă + confirmare + istoric)**
- [ ] **Frontend: Checklist Documente — progress ring + categorii + template mapping**
- [ ] **Frontend: cross-links între secțiuni (Eligibilitate↔Ghid, Checklist↔Neemia, Solomon↔Elemente)**
- [ ] **Frontend: Dashboard pagina Panou (02_Panou.jsx referință)**
