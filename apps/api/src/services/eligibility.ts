import { db } from "../db";
import {
  projects, projectEligibility, rules, companies, companyFinancials,
  companyElements, documentFolders, documents, orgConfig, projectElements, elementDefinitions,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { anthropic, withAILimit } from "../lib/anthropic";
import { logAIUsage } from "./aiUsage";
import { resolveFieldKey } from "@dosarfonduri/shared";

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
  referenceValues?: Record<string, number>,
): Record<string, any> {
  const f20 = (latestFinancial?.f20 || {}) as any;
  const f10 = (latestFinancial?.f10 || {}) as any;
  const f30 = (latestFinancial?.f30 || {}) as any;
  const raw = (company.onrcRawData || {}) as any;

  // Core direct fields
  const angajati = f30.numarMediuSalariati || 0;
  const cifraAfaceri = f20.cifraAfaceriNeta || 0;
  const profitNet = f20.profitNet || 0;
  const capitaluriProprii = f10.capitaluriProprii || 0;
  const activeImobilizate = f10.activeImobilizate?.total || 0;
  const activeCirculante = f10.activeCirculante?.total || 0;
  const activeTotale = activeImobilizate + activeCirculante;
  const datoriiTotale = f10.datoriiTotal || 0;
  const datoriiSub1An = f10.datoriiSub1An || f10.datoriiCurente || 0;
  const datoriiPeste1An = f10.datoriiPesteAnul || 0;

  // Reference values for EUR conversion (defaults if not provided)
  const cursEur = referenceValues?.curs_eur_ron || 4.97;
  const cifraAfaceriEur = cifraAfaceri > 0 ? Math.round(cifraAfaceri / cursEur) : 0;
  const activeTotaleEur = activeTotale > 0 ? Math.round(activeTotale / cursEur) : 0;

  // IMM classification — correct EU definition (Reg. 651/2014 Anexa I)
  // Uses EUR thresholds and checks BOTH CA and active totale (OR condition)
  const pragMicroEmp = referenceValues?.prag_micro_angajati || 10;
  const pragMicroCa = referenceValues?.prag_micro_ca_eur || 2000000;
  const pragMicroActive = referenceValues?.prag_micro_active_eur || 2000000;
  const pragMicaEmp = referenceValues?.prag_mica_angajati || 50;
  const pragMicaCa = referenceValues?.prag_mica_ca_eur || 10000000;
  const pragMicaActive = referenceValues?.prag_mica_active_eur || 10000000;
  const pragMijlocieEmp = referenceValues?.prag_mijlocie_angajati || 250;
  const pragMijlocieCa = referenceValues?.prag_mijlocie_ca_eur || 50000000;
  const pragMijlocieActive = referenceValues?.prag_mijlocie_active_eur || 43000000;

  let clasificareImm: string;
  if (angajati < pragMicroEmp && (cifraAfaceriEur < pragMicroCa || activeTotaleEur < pragMicroActive)) {
    clasificareImm = "micro";
  } else if (angajati < pragMicaEmp && (cifraAfaceriEur < pragMicaCa || activeTotaleEur < pragMicaActive)) {
    clasificareImm = "mica";
  } else if (angajati < pragMijlocieEmp && (cifraAfaceriEur < pragMijlocieCa || activeTotaleEur < pragMijlocieActive)) {
    clasificareImm = "mijlocie";
  } else {
    clasificareImm = "mare";
  }

  // CAEN secundare
  const caenSecundare = (raw.activitatiSecundare || [])
    .map((a: any) => typeof a === "string" ? a : a.cod || a.code || "")
    .filter(Boolean);

  // Natura capital
  const natura = (company.naturaCapital || {}) as any;

  // TVA
  const vatStr = String(raw.vat || raw.VAT || "");

  const companyData: Record<string, any> = {
    // Solicitant
    forma_juridica: company.formaJuridica,
    cui: company.cui,
    denumire: company.denumire,
    reg_com: company.regCom,
    cod_caen: company.caen,
    cod_caen_secundare: caenSecundare.length > 0 ? caenSecundare.join(",") : null,
    numar_activitati_secundare: caenSecundare.length,
    stare: company.stare,
    an_infiintare: company.anInfiintare,
    vechime_ani: new Date().getFullYear() - (company.anInfiintare || 2020),
    capital_social: parseFloat(company.capitalSocial?.toString() || "0"),
    clasificare_imm: clasificareImm,
    platitor_tva: vatStr && vatStr !== "false" && vatStr !== "0" ? "da" : "nu",
    cod_tva: vatStr || null,
    capital_privat_autohton_pct: natura.privatAutohton ?? null,
    capital_privat_strain_pct: natura.privatStrain ?? null,
    capital_stat_pct: natura.stat ?? null,
    cifra_afaceri_eur: cifraAfaceriEur,
    active_totale_eur: activeTotaleEur,

    // Financiar — core
    angajati,
    cifra_afaceri: cifraAfaceri,
    profit_net: profitNet,
    profit_brut: f20.profitBrut || 0,
    capitaluri_proprii: capitaluriProprii,
    active_imobilizate: activeImobilizate,
    active_circulante: activeCirculante,
    active_totale: activeTotale,
    datorii_totale: datoriiTotale,
    datorii_sub_1an: datoriiSub1An,
    datorii_peste_1an: datoriiPeste1An,
    stocuri: f10.activeCirculante?.stocuri || 0,
    creante: f10.activeCirculante?.creante || 0,
    casa_si_conturi: f10.activeCirculante?.casa || 0,
    venituri_exploatare: f20.venituriExploatare || 0,
    cheltuieli_exploatare: f20.cheltuieliExploatare || 0,
    rezultat_exploatare: f20.rezultatExploatare || 0,
    cheltuieli_personal: f20.cheltuieliPersonal || 0,

    // Financiar — derived ratios
    grad_indatorare: capitaluriProprii > 0 ? Math.round((datoriiTotale / capitaluriProprii) * 100) / 100 : null,
    lichiditate_curenta: datoriiSub1An > 0 ? Math.round((activeCirculante / datoriiSub1An) * 100) / 100 : null,
    solvabilitate: activeTotale > 0 ? Math.round((capitaluriProprii / activeTotale) * 100) / 100 : null,
    rentabilitate: cifraAfaceri > 0 ? Math.round((profitNet / cifraAfaceri) * 100) / 100 : null,

    // Locatie
    judet: company.judet,
    localitate: company.localitate,
    adresa: company.adresa,
    cod_postal: company.codPostal,

    // ONRC raw flags
    insolventa: raw.insolventa ? "da" : "nu",
    dizolvare: raw.dizolvare ? "da" : "nu",
    lichidare: raw.lichidare ? "da" : "nu",
    restrictii: raw.restrictii ? "da" : "nu",
  };

  // Sedii secundare
  if (raw.sediiSecundare?.length > 0) {
    companyData.numar_sedii_secundare = raw.sediiSecundare.length;
  } else {
    companyData.numar_sedii_secundare = 0;
  }

  // Per-year financials
  if (allFinancials) {
    for (const fin of allFinancials) {
      const yr = fin.year;
      const yf20 = (fin.f20 || {}) as any;
      const yf10 = (fin.f10 || {}) as any;
      const yf30 = (fin.f30 || {}) as any;
      companyData[`cifra_afaceri_${yr}`] = yf20.cifraAfaceriNeta;
      companyData[`profit_net_${yr}`] = yf20.profitNet;
      companyData[`angajati_${yr}`] = yf30.numarMediuSalariati;
      companyData[`capitaluri_proprii_${yr}`] = yf10.capitaluriProprii;
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

  // Resolve field aliases to canonical key (e.g. "numar_angajati" → "angajati")
  const canonicalField = resolveFieldKey(condition.field);
  const fieldValue = companyData[canonicalField] ?? companyData[condition.field];
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

  // Load reference values for calculations (EUR rate, IMM thresholds)
  let refValues: Record<string, number> | undefined;
  try {
    const { getReferenceValuesMap } = await import("../routes/config");
    refValues = await getReferenceValuesMap(organizationId);
  } catch { /* use defaults */ }

  // Build company data using shared function
  const companyData = buildCompanyData(company, latestFinancial, allFinancials, refValues);

  // Overlay projectElements values (Solomon-collected data takes precedence)
  await overlayProjectElements(companyData, projectId, organizationId);

  // Preserve manual overrides AND pre-eligibility notes before re-evaluating
  const existingResults = await db.query.projectEligibility.findMany({
    where: eq(projectEligibility.projectId, projectId),
  });
  const overrides = new Map(
    existingResults
      .filter(r => r.overrideResult !== null)
      .map(r => [r.ruleId, { overrideResult: r.overrideResult, overrideBy: r.overrideBy, notes: r.notes }])
  );
  const preEligNotes = new Map(
    existingResults
      .filter(r => r.notes && r.notes.startsWith("[Pre-elig]"))
      .map(r => [r.ruleId, r.notes])
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
      // Preserve pre-eligibility notes: append them to new notes so instant feedback isn't lost
      const preNote = preEligNotes.get(r.ruleId);
      const combinedNotes = preNote && r.notes
        ? `${r.notes} | ${preNote}`
        : r.notes || preNote || null;
      return {
        projectId,
        ruleId: r.ruleId,
        status: r.status,
        autoResult: r.autoResult,
        notes: combinedNotes,
      };
    });

    await db.transaction(async (tx) => {
      await tx.delete(projectEligibility).where(eq(projectEligibility.projectId, projectId));
      await tx.insert(projectEligibility).values(insertValues);
    });
  }
}

// ============================================================
// PRE-ELIGIBILITY AT PROJECT CREATION (instant, from companyElements)
// ============================================================

/**
 * Run instant pre-eligibility using companyElements (materialized company data).
 * Only evaluates fixed rules — no AI, no cost, instant.
 * Updates existing project_eligibility rows (seeded as "pending" by seedEligibilityRows).
 * Called right after project creation, before the full checkEligibility().
 */
export async function runPreEligibilityForProject(
  projectId: string,
  companyId: string,
  sessionFolderId: string,
  organizationId: string,
): Promise<{ evaluated: number; passed: number; failed: number }> {
  // 1. Load companyElements as flat key→value map
  const companyEls = await db.query.companyElements.findMany({
    where: eq(companyElements.companyId, companyId),
  });
  if (companyEls.length === 0) return { evaluated: 0, passed: 0, failed: 0 };

  const companyData: Record<string, any> = {};
  for (const el of companyEls) {
    if (!el.value) continue;
    const num = parseFloat(el.value);
    companyData[el.elementKey] = !isNaN(num) && el.value === String(num) ? num : el.value;
  }

  // 2. Get all rules from session
  const allRules = await getRulesForSession(sessionFolderId);
  const fixedRules = allRules.filter(r => r.type === "fixed");

  if (fixedRules.length === 0) return { evaluated: 0, passed: 0, failed: 0 };

  // 3. Evaluate fixed rules against companyData
  let passed = 0;
  let failed = 0;
  let evaluated = 0;

  for (const rule of fixedRules) {
    const result = evaluateFixedRule(rule, companyData);
    if (result.status === "passed" || result.status === "failed") {
      evaluated++;
      if (result.status === "passed") passed++;
      else failed++;

      // Update the seeded project_eligibility row for this rule
      await db.update(projectEligibility).set({
        status: result.status,
        autoResult: result.autoResult,
        notes: result.notes ? `[Pre-elig] ${result.notes}` : null,
        checkedAt: new Date(),
      }).where(
        and(
          eq(projectEligibility.projectId, projectId),
          eq(projectEligibility.ruleId, rule.id),
        )
      );
    }
  }

  console.log(`[preEligibility] Proiect ${projectId}: ${evaluated}/${fixedRules.length} reguli fixe evaluate instant (${passed} passed, ${failed} failed)`);
  return { evaluated, passed, failed };
}
