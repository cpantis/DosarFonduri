import { db } from "../db";
import {
  projects, projectEligibility, rules, companies, companyFinancials,
  documentFolders, documents, orgConfig, projectElements, elementDefinitions,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { anthropic, withAILimit } from "../lib/anthropic";
import { logAIUsage } from "./aiUsage";

// ============================================================
// SHARED UTILITIES (used by both project eligibility and pre-eligibility)
// ============================================================

/**
 * Build a flat companyData map from company fields + financials.
 * Optionally overlay with projectElements (Solomon-collected data takes precedence).
 */
export function buildCompanyData(
  company: any,
  latestFinancial: any | null,
  allFinancials?: any[],
): Record<string, any> {
  const companyData: Record<string, any> = {
    forma_juridica: company.formaJuridica,
    cui: company.cui,
    cod_caen: company.caen,
    stare: company.stare,
    an_infiintare: company.anInfiintare,
    vechime_ani: new Date().getFullYear() - (company.anInfiintare || 2020),
    capital_social: parseFloat(company.capitalSocial?.toString() || "0"),
    angajati: (latestFinancial?.f30 as any)?.numarMediuSalariati || 0,
    cifra_afaceri: (latestFinancial?.f20 as any)?.cifraAfaceriNeta || 0,
    profit_net: (latestFinancial?.f20 as any)?.profitNet || 0,
    capitaluri_proprii: (latestFinancial?.f10 as any)?.capitaluriProprii || 0,
    judet: company.judet,
    localitate: company.localitate,
  };

  // Add per-year financials if available
  if (allFinancials) {
    for (const fin of allFinancials) {
      const yr = fin.year;
      const f20 = (fin.f20 || {}) as any;
      const f10 = (fin.f10 || {}) as any;
      const f30 = (fin.f30 || {}) as any;
      companyData[`cifra_afaceri_${yr}`] = f20.cifraAfaceriNeta;
      companyData[`profit_net_${yr}`] = f20.profitNet;
      companyData[`angajati_${yr}`] = f30.numarMediuSalariati;
      companyData[`capitaluri_proprii_${yr}`] = f10.capitaluriProprii;
    }
  }

  return companyData;
}

/**
 * Overlay companyData with projectElements values.
 * Solomon-collected data takes precedence over ONRC/financials.
 */
export async function overlayProjectElements(
  companyData: Record<string, any>,
  projectId: string,
  organizationId: string,
): Promise<void> {
  const projEls = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });
  if (projEls.length === 0) return;

  const elemDefs = await db.query.elementDefinitions.findMany({
    where: eq(elementDefinitions.organizationId, organizationId),
  });
  const elemDefMap = new Map(elemDefs.map(ed => [ed.id, ed]));
  for (const pe of projEls) {
    if (!pe.value || !pe.value.trim()) continue;
    const ed = pe.elementDefId ? elemDefMap.get(pe.elementDefId) : null;
    if (ed) companyData[ed.elementKey] = pe.value;
  }
}

/**
 * Overlay companyData with companyElements values (from materialized table).
 * Used for pre-eligibility when there's no project yet.
 */
export function overlayCompanyElements(
  companyData: Record<string, any>,
  companyElementRows: Array<{ elementKey: string; value: string | null }>,
): void {
  for (const el of companyElementRows) {
    if (!el.value || !el.value.trim()) continue;
    // Only set if not already present (companyData from direct fields has priority for core keys)
    if (!(el.elementKey in companyData)) {
      const num = parseFloat(el.value);
      companyData[el.elementKey] = !isNaN(num) && el.value === String(num) ? num : el.value;
    }
  }
}

/**
 * Find all rules from all guide documents in a session folder.
 */
export async function getRulesForSession(
  sessionFolderId: string,
): Promise<Array<typeof rules.$inferSelect & { documentName: string; documentFileType: string }>> {
  const sessionFolders = await db.query.documentFolders.findMany({
    where: and(
      eq(documentFolders.parentId, sessionFolderId),
      eq(documentFolders.type, "ghiduri"),
    ),
  });

  const allRules: Array<typeof rules.$inferSelect & { documentName: string; documentFileType: string }> = [];
  for (const folder of sessionFolders) {
    const docs = await db.query.documents.findMany({
      where: eq(documents.folderId, folder.id),
    });
    for (const doc of docs) {
      const docRules = await db.query.rules.findMany({
        where: eq(rules.documentId, doc.id),
      });
      allRules.push(...docRules.map(r => ({
        ...r,
        documentName: doc.name,
        documentFileType: doc.fileType,
      })));
    }
  }
  return allRules;
}

/**
 * Evaluate a single fixed rule against companyData.
 */
export function evaluateFixedRule(
  rule: typeof rules.$inferSelect,
  companyData: Record<string, any>,
): { status: "passed" | "failed" | "pending" | "not_applicable"; autoResult: boolean | null; notes: string | null } {
  const condition = rule.condition as any;
  if (!condition || !condition.field) {
    return { status: "not_applicable", autoResult: null, notes: null };
  }

  const fieldValue = companyData[condition.field];
  if (fieldValue === undefined || fieldValue === null) {
    return { status: "pending", autoResult: null, notes: "Date lipsă: " + condition.field };
  }

  let passed = false;
  const condNum = parseFloat(condition.value);
  const fieldNum = typeof fieldValue === "number" ? fieldValue : parseFloat(String(fieldValue));
  const bothNumeric = !isNaN(condNum) && !isNaN(fieldNum);

  switch (condition.operator) {
    case "eq": passed = String(fieldValue).toLowerCase() === String(condition.value).toLowerCase(); break;
    case "neq": passed = String(fieldValue).toLowerCase() !== String(condition.value).toLowerCase(); break;
    case "gt": passed = bothNumeric ? fieldNum > condNum : String(fieldValue) > String(condition.value); break;
    case "gte": passed = bothNumeric ? fieldNum >= condNum : String(fieldValue) >= String(condition.value); break;
    case "lt": passed = bothNumeric ? fieldNum < condNum : String(fieldValue) < String(condition.value); break;
    case "lte": passed = bothNumeric ? fieldNum <= condNum : String(fieldValue) <= String(condition.value); break;
    case "in": {
      const inValues = Array.isArray(condition.value) ? condition.value : condition.value.split(",").map((v: string) => v.trim());
      passed = inValues.includes(String(fieldValue));
      break;
    }
    case "not_in": {
      const notInValues = Array.isArray(condition.value) ? condition.value : condition.value.split(",").map((v: string) => v.trim());
      passed = !notInValues.includes(String(fieldValue));
      break;
    }
    case "between": {
      const low = parseFloat(condition.value);
      const high = parseFloat(condition.value2);
      const numField = typeof fieldValue === "number" ? fieldValue : parseFloat(String(fieldValue));
      passed = !isNaN(numField) && !isNaN(low) && !isNaN(high) && numField >= low && numField <= high;
      break;
    }
    default:
      return { status: "pending", autoResult: null, notes: "Operator necunoscut: " + condition.operator };
  }

  return {
    status: passed ? "passed" : "failed",
    autoResult: passed,
    notes: `${condition.field}: ${fieldValue} ${condition.operator} ${condition.value}${condition.value2 ? " - " + condition.value2 : ""}`,
  };
}

/**
 * Evaluate interpreted rules using Opus + Extended Thinking.
 */
export async function evaluateInterpretedRules(
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
  const config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, organizationId),
  });
  const model = config?.reguliInterpModel || "claude-opus-4-6";
  const useET = config?.reguliInterpET ?? true;

  // Build company context
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
  const f20 = (f.f20 || {}) as any;
  const f10 = (f.f10 || {}) as any;
  const f30 = (f.f30 || {}) as any;
  return `  ${f.year}: CA=${f20.cifraAfaceriNeta || "?"} | Profit brut=${f20.profitBrut || "?"} | Profit net=${f20.profitNet || "?"} | Angajați=${f30.numarMediuSalariati || "?"} | Cap. proprii=${f10.capitaluriProprii || "?"} | Active imob.=${f10.activeImobilizate?.total || "?"} | Active circ.=${f10.activeCirculante?.total || "?"}`;
}).join("\n")}
`;

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

  const requestParams: any = {
    model,
    max_tokens: useET ? 24000 : 8000,
    system: `Ești expert senior în fonduri europene cu 15+ ani experiență. Evaluezi reguli de eligibilitate interpretate contra datelor reale ale unei firme.

INSTRUCȚIUNI:
1. Pentru fiecare regulă, analizează dacă firma ÎNDEPLINEȘTE condiția
2. Unele reguli necesită raționament complex (arbori decizionali, criterii cumulative, interpretare contextuală)
3. Dacă nu ai date suficiente pentru a evalua, marchează "pending" cu motivul
4. Dacă regula nu se aplică firmei, marchează "not_applicable"
5. Fii CONSERVATOR — dacă ai dubii, marchează "pending" cu explicația

RETURNEAZĂ DOAR JSON valid — array de obiecte, fără backticks, fără explicații.`,
    messages: [{
      role: "user" as const,
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
    const response = await withAILimit(() => anthropic.messages.create(requestParams));

    const textBlock = response.content.find((b: any) => b.type === "text");
    const content = textBlock ? (textBlock as any).text : "[]";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let evaluations: any[];
    try {
      evaluations = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI eligibility response:", cleaned.slice(0, 500));
      return interpretedRules.map(rule => ({
        ruleId: rule.id,
        status: "pending" as const,
        autoResult: null,
        notes: "Evaluare AI returnare JSON invalid — verificare manuală necesară",
      }));
    }

    if (!Array.isArray(evaluations)) {
      return interpretedRules.map(rule => ({
        ruleId: rule.id,
        status: "pending" as const,
        autoResult: null,
        notes: "Evaluare AI returnare format invalid — verificare manuală necesară",
      }));
    }

    await logAIUsage({
      organizationId,
      agent: "ghid_rules",
      model,
      tokensInput: response.usage.input_tokens,
      tokensOutput: response.usage.output_tokens,
      action: "evaluate_interpreted_rules",
    });

    const reviewThreshold = parseFloat(config?.reviewThreshold?.toString() || "0.85");

    return interpretedRules.map((rule, idx) => {
      const eval_ = evaluations.find((e: any) => e.index === idx);
      if (!eval_) {
        return { ruleId: rule.id, status: "pending" as const, autoResult: null, notes: "Evaluare eșuată" };
      }

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
    return interpretedRules.map(rule => ({
      ruleId: rule.id,
      status: "pending" as const,
      autoResult: null,
      notes: "Evaluare AI eșuată — verificare manuală necesară",
    }));
  }
}

// ============================================================
// PROJECT ELIGIBILITY (existing flow — uses shared functions)
// ============================================================

export async function checkEligibility(projectId: string, organizationId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) return;

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, project.companyId),
  });
  if (!company) return;

  // Find ALL rules from ALL guides in this project's session
  const allRules = await getRulesForSession(project.folderId);

  // Get company financials
  const allFinancials = await db.query.companyFinancials.findMany({
    where: eq(companyFinancials.companyId, company.id),
    orderBy: (f, { desc }) => [desc(f.year)],
  });
  const latestFinancial = allFinancials[0] || null;

  // Build company data using shared function
  const companyData = buildCompanyData(company, latestFinancial, allFinancials);

  // Overlay projectElements values (Solomon-collected data takes precedence)
  await overlayProjectElements(companyData, projectId, organizationId);

  // Preserve manual overrides before re-evaluating
  const existingResults = await db.query.projectEligibility.findMany({
    where: eq(projectEligibility.projectId, projectId),
  });
  const overrides = new Map(
    existingResults
      .filter(r => r.overrideResult !== null)
      .map(r => [r.ruleId, { overrideResult: r.overrideResult, overrideBy: r.overrideBy, notes: r.notes }])
  );

  // === STEP 1: FIXED RULES (automatic, no AI) ===
  const results: Array<{
    ruleId: string;
    status: "passed" | "failed" | "pending" | "not_applicable";
    autoResult: boolean | null;
    notes: string | null;
  }> = [];

  const fixedRules = allRules.filter(r => r.type === "fixed");
  const interpretedRules = allRules.filter(r => r.type === "interpreted");

  for (const rule of fixedRules) {
    const result = evaluateFixedRule(rule, companyData);
    results.push({ ruleId: rule.id, ...result });
  }

  // === STEP 2: INTERPRETED RULES (Opus + ET) ===
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

  // Atomic delete+insert inside a transaction to prevent race conditions
  if (results.length > 0) {
    const insertValues = results.map(r => {
      const override = overrides.get(r.ruleId);
      if (override) {
        return {
          projectId,
          ruleId: r.ruleId,
          status: override.overrideResult === true ? "passed" as const : override.overrideResult === false ? "failed" as const : r.status,
          autoResult: r.autoResult,
          overrideResult: override.overrideResult,
          overrideBy: override.overrideBy,
          notes: override.notes || r.notes,
        };
      }
      return {
        projectId,
        ruleId: r.ruleId,
        status: r.status,
        autoResult: r.autoResult,
        notes: r.notes,
      };
    });

    await db.transaction(async (tx) => {
      await tx.delete(projectEligibility).where(eq(projectEligibility.projectId, projectId));
      await tx.insert(projectEligibility).values(insertValues);
    });
  }
}
