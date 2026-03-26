import { db } from "../db";
import {
  companies, companyFinancials, companyElements, documentFolders,
  elementRuleLinks, elementDefinitions, ruleReferenceLinks, guideReferenceTables,
} from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  buildCompanyData, overlayCompanyElements, getRulesForSession,
  evaluateFixedRule,
} from "./eligibility";
import { anthropic, withAILimit } from "../lib/anthropic";

export interface RuleElementInfo {
  elementKey: string;
  displayName: string;
  category: string | null;
  value: any;            // actual value from companyData (null if missing)
  expectedValue: any;    // what the rule condition expects
  expectedOperator: string | null;
  isMissing: boolean;
}

export interface RuleRefTableResult {
  tableName: string;
  usage: "validates" | "scores" | "classifies";
  status: "passed" | "failed" | "warning" | "info";
  message: string;
  matchedRow?: Record<string, any>;
}

export interface PreEligibilityRule {
  id: string;
  type: "fixed" | "interpreted";
  description: string;
  category: string | null;
  status: "passed" | "failed" | "pending" | "not_applicable";
  autoResult: boolean | null;
  notes: string | null;
  condition: any;
  sourceDocument: { id: string; name: string };
  elements: RuleElementInfo[];
  refTableResults: RuleRefTableResult[];
}

export interface PreEligibilitySummary {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  notApplicable: number;
  fixed: { total: number; passed: number; failed: number; pending: number };
  interpreted: { total: number; passed: number; failed: number; pending: number };
  missingElements: string[];
}

export interface PreEligibilityResult {
  rules: PreEligibilityRule[];
  summary: PreEligibilitySummary;
  companyDataUsed: Record<string, any>;
}

/**
 * Lookup a value in a reference table row using exact, substring, and numeric range matching.
 */
function findInRefTable(
  tableData: Array<Record<string, any>>,
  lookupKey: string,
  searchValue: string,
): Record<string, any> | undefined {
  const normalized = searchValue.toLowerCase().trim();
  const searchNum = parseFloat(normalized.replace(/\./g, "").replace(",", "."));

  return tableData.find(row => {
    const cellValue = String(row[lookupKey] || "").toLowerCase();
    if (cellValue === normalized || cellValue.includes(normalized) || normalized.includes(cellValue)) {
      return true;
    }
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
}

/**
 * Run pre-eligibility check for a company against a session's rules.
 * Does NOT persist results — returns them ephemerally.
 * Enriched with element info and reference table cross-validation.
 */
export async function checkPreEligibility(
  companyId: string,
  sessionFolderId: string,
  organizationId: string,
): Promise<PreEligibilityResult> {
  // 1. Load company
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.organizationId, organizationId)),
  });
  if (!company) throw new Error("Firma nu a fost găsită");

  // 2. Validate session folder
  const sessionFolder = await db.query.documentFolders.findFirst({
    where: and(
      eq(documentFolders.id, sessionFolderId),
      eq(documentFolders.organizationId, organizationId),
      eq(documentFolders.type, "sesiune"),
    ),
  });
  if (!sessionFolder) throw new Error("Sesiunea nu a fost găsită");

  // 3. Get financials
  const allFinancials = await db.query.companyFinancials.findMany({
    where: eq(companyFinancials.companyId, companyId),
    orderBy: (f, { desc }) => [desc(f.year)],
  });
  const latestFinancial = allFinancials[0] || null;

  // 4. Build companyData from direct fields
  const companyData = buildCompanyData(company, latestFinancial, allFinancials);

  // 5. Overlay with materialized companyElements (aliases, derived values)
  const companyEls = await db.query.companyElements.findMany({
    where: eq(companyElements.companyId, companyId),
  });
  overlayCompanyElements(companyData, companyEls);

  // 6. Get all rules from session guides
  const allRules = await getRulesForSession(sessionFolderId);
  if (allRules.length === 0) {
    return {
      rules: [],
      summary: {
        total: 0, passed: 0, failed: 0, pending: 0, notApplicable: 0,
        fixed: { total: 0, passed: 0, failed: 0, pending: 0 },
        interpreted: { total: 0, passed: 0, failed: 0, pending: 0 },
        missingElements: [],
      },
      companyDataUsed: companyData,
    };
  }

  // 7. Batch-load element_rule_links for all rules
  const ruleIds = allRules.map(r => r.id);
  const allElemLinks = ruleIds.length > 0
    ? await db.query.elementRuleLinks.findMany({
        where: inArray(elementRuleLinks.ruleId, ruleIds),
      })
    : [];

  // Batch-load element definitions for linked elements
  const linkedElemDefIds = [...new Set(allElemLinks.map(l => l.elementDefId).filter(Boolean))] as string[];
  const elemDefs = linkedElemDefIds.length > 0
    ? await db.query.elementDefinitions.findMany({
        where: inArray(elementDefinitions.id, linkedElemDefIds),
      })
    : [];
  const elemDefMap = new Map(elemDefs.map(ed => [ed.id, ed]));

  // Also build a key-based map of all org element definitions for condition.field matching
  const orgElemDefs = await db.query.elementDefinitions.findMany({
    where: eq(elementDefinitions.organizationId, organizationId),
  });
  const elemDefByKey = new Map(orgElemDefs.map(ed => [ed.elementKey.toLowerCase(), ed]));

  // Group element links by ruleId
  const elemLinksByRule = new Map<string, typeof allElemLinks>();
  for (const link of allElemLinks) {
    const existing = elemLinksByRule.get(link.ruleId) || [];
    existing.push(link);
    elemLinksByRule.set(link.ruleId, existing);
  }

  // 8. Batch-load rule_reference_links and reference tables
  const allRefLinks = ruleIds.length > 0
    ? await db.query.ruleReferenceLinks.findMany({
        where: inArray(ruleReferenceLinks.ruleId, ruleIds),
      })
    : [];
  const refTableIds = [...new Set(allRefLinks.map(l => l.referenceTableId))];
  const refTables = refTableIds.length > 0
    ? await db.query.guideReferenceTables.findMany({
        where: inArray(guideReferenceTables.id, refTableIds),
      })
    : [];
  const refTableMap = new Map(refTables.map(rt => [rt.id, rt]));

  // Group ref links by ruleId
  const refLinksByRule = new Map<string, typeof allRefLinks>();
  for (const link of allRefLinks) {
    const existing = refLinksByRule.get(link.ruleId) || [];
    existing.push(link);
    refLinksByRule.set(link.ruleId, existing);
  }

  // 9. AI-first classification of company-relevant rules
  //
  // Layer 1: Sonnet with consultant mindset determines which rules check
  //          company/beneficiary eligibility vs project/investment specifics.
  // Layer 2: Heuristic fallback if AI unavailable.

  const fixedRulesWithConditions = allRules
    .filter(r => r.type === "fixed" && (r.condition as any)?.field)
    .map(r => ({
      id: r.id,
      field: String((r.condition as any).field),
      description: (r.description || "").slice(0, 150),
    }));

  // Layer 1: Sonnet AI classification (primary)
  let companyRelevantRuleIds = new Set<string>();
  let aiClassified = false;

  if (fixedRulesWithConditions.length > 0) {
    try {
      const ruleList = fixedRulesWithConditions.map(r => `${r.id}|${r.field}|${r.description}`).join("\n");
      const response = await withAILimit(() => anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: `Ești Solomon — consultant senior fonduri europene. Analizezi reguli de eligibilitate dintr-un ghid de finanțare.

MISIUNE: Determină care reguli verifică ELIGIBILITATEA SOLICITANTULUI (firma/persoana care aplică).

REGULI DESPRE SOLICITANT (include):
- Forma juridică (SRL, PFA, II, IF, SA, ONG, GAL, etc.)
- Cod CAEN principal/secundar, activități eligibile
- Vechime firmă, ani de activitate, an înființare
- Date financiare: cifra de afaceri, profit, angajați, capital social, solvabilitate, lichiditate
- Localizare: județ, regiune, zonă eligibilă, rural/urban
- Categorie IMM (micro, mică, mijlocie, mare)
- Statut fiscal: datorii, cazier, insolvență, reorganizare
- Exploatație agricolă: suprafață, efectiv animal, UVM, producție standard
- Certificări, autorizații, acreditări ale firmei
- Vârsta fermierului (tânăr fermier)

REGULI DESPRE PROIECT (exclude):
- Valoare investiție/proiect/contract/achiziții
- Cofinanțare, intensitate ajutor, sprijin solicitat
- Durată implementare, termene depunere
- Buget, costuri, devize estimative
- Punctaj selecție, praguri de calitate
- Plan de afaceri, studiu fezabilitate (ca documente)
- Tip investiție, componente, sub-măsuri

Returnează DOAR id-urile regulilor DESPRE SOLICITANT, separate prin virgulă. Fără explicații.`,
        messages: [{
          role: "user",
          content: `Clasifică aceste ${fixedRulesWithConditions.length} reguli (id|camp|descriere):\n${ruleList}`,
        }],
      }));

      const text = (response.content[0] as any).text?.trim() || "";
      const ids = text.split(/[,\s\n]+/).map((id: string) => id.trim()).filter(Boolean);
      companyRelevantRuleIds = new Set(ids);
      aiClassified = true;
      console.log(`[preEligibility] AI classified ${companyRelevantRuleIds.size}/${fixedRulesWithConditions.length} rules as company-relevant`);
    } catch (e: any) {
      console.warn(`[preEligibility] AI classification failed, using heuristic fallback:`, e.message);
    }
  }

  // Layer 2: Heuristic fallback (if AI unavailable)
  if (!aiClassified) {
    const COMPANY_CORE_FIELDS = new Set([
      "forma_juridica", "cui", "cod_caen", "stare", "an_infiintare", "vechime_ani",
      "capital_social", "angajati", "cifra_afaceri", "profit_net", "capitaluri_proprii",
      "judet", "localitate",
    ]);
    const COMPANY_YEAR_PREFIXES = ["cifra_afaceri_", "profit_net_", "angajati_", "capitaluri_proprii_"];
    const COMPANY_EXTRA_PATTERNS = [
      "forma_", "tip_beneficiar", "categoria_beneficiar", "tip_solicitant",
      "varsta_firma", "ani_activitate", "numar_angajati", "numar_salariati",
      "rata_solvabilitate", "rata_lichiditate", "rata_rentabilitate",
      "rezultat_exploatare", "profit_brut", "datorii_totale", "active_totale",
      "regiune", "zona_eligibila", "dimensiune_economica", "suprafata_agricola",
      "efectiv_animal", "uvm_", "are_datorii", "cazier_fiscal",
      "nu_este_in_", "este_in_", "inregistrat_", "autorizat_",
      "tinar_fermier", "tanar_fermier", "cod_caen_", "caen_",
    ];
    const PROJECT_BLOCKLIST = [
      "valoare_proiect", "valoare_investit", "valoare_eligibil", "valoare_contract",
      "cofinantare", "intensitate_ajutor", "durata_implementare", "durata_proiect",
      "tip_investit", "punctaj_", "prag_", "scor_", "cost_", "buget_", "deviz_",
      "termen_depunere", "plan_afaceri", "studiu_fezabilitate", "_sprijin",
    ];

    for (const r of fixedRulesWithConditions) {
      const lower = r.field.toLowerCase();
      if (COMPANY_CORE_FIELDS.has(lower)) { companyRelevantRuleIds.add(r.id); continue; }
      if (COMPANY_YEAR_PREFIXES.some(p => lower.startsWith(p))) { companyRelevantRuleIds.add(r.id); continue; }
      if (PROJECT_BLOCKLIST.some(p => lower.startsWith(p) || lower.includes(p))) continue;
      if (COMPANY_EXTRA_PATTERNS.some(p => lower.startsWith(p) || lower.includes(p))) { companyRelevantRuleIds.add(r.id); continue; }
      const ed = elemDefByKey.get(lower);
      if (ed?.category && ["financial", "legal", "beneficiary", "location", "farm"].includes(ed.category)) {
        companyRelevantRuleIds.add(r.id);
      }
    }
    console.log(`[preEligibility] Heuristic classified ${companyRelevantRuleIds.size}/${fixedRulesWithConditions.length} rules as company-relevant`);
  }

  const companyDataKeys = new Set(Object.keys(companyData));

  // 10. Evaluate rules — only include company-relevant rules
  const results: PreEligibilityRule[] = [];
  const allMissingElements: string[] = [];

  for (const rule of allRules) {
    const condition = rule.condition as any;

    // Skip interpreted rules (need AI + project context)
    if (rule.type === "interpreted") continue;

    // Skip fixed rules with no condition
    if (!condition?.field) continue;

    // Skip rules NOT classified as company-relevant
    if (!companyRelevantRuleIds.has(rule.id)) continue;

    const fieldKey = String(condition.field).toLowerCase();

    // Build element info for this rule
    const elements: RuleElementInfo[] = [];
    const ruleElemLinks = elemLinksByRule.get(rule.id) || [];

    for (const link of ruleElemLinks) {
      const ed = link.elementDefId ? elemDefMap.get(link.elementDefId) : null;
      if (!ed) continue;
      const value = companyData[ed.elementKey] ?? null;
      const isMissing = value === null || value === undefined;
      if (isMissing && !allMissingElements.includes(ed.elementKey)) {
        allMissingElements.push(ed.elementKey);
      }
      elements.push({
        elementKey: ed.elementKey,
        displayName: ed.displayName || ed.elementKey,
        category: ed.category,
        value,
        expectedValue: condition?.value ?? null,
        expectedOperator: condition?.operator ?? null,
        isMissing,
      });
    }

    // If no links found but condition.field exists, infer element from condition
    if (elements.length === 0 && condition?.field) {
      const fieldKey = String(condition.field).toLowerCase();
      const ed = elemDefByKey.get(fieldKey);
      const value = companyData[fieldKey] ?? null;
      const isMissing = value === null || value === undefined;
      if (isMissing && !allMissingElements.includes(fieldKey)) {
        allMissingElements.push(fieldKey);
      }
      elements.push({
        elementKey: fieldKey,
        displayName: ed?.displayName || fieldKey,
        category: ed?.category || null,
        value,
        expectedValue: condition.value ?? null,
        expectedOperator: condition.operator ?? null,
        isMissing,
      });
    }

    // Cross-check against reference tables
    const refTableResults: RuleRefTableResult[] = [];
    const ruleRefLinks = refLinksByRule.get(rule.id) || [];
    for (const refLink of ruleRefLinks) {
      const refTable = refTableMap.get(refLink.referenceTableId);
      if (!refTable || !refTable.data) continue;

      const tableData = refTable.data as Array<Record<string, any>>;
      const lookupKey = refTable.lookupKey || "key";

      // Find the value to look up — use the primary element's value
      const primaryElement = elements[0];
      const lookupValue = primaryElement ? String(primaryElement.value ?? "") : "";

      if (!lookupValue) {
        refTableResults.push({
          tableName: refTable.name,
          usage: refLink.usage as "validates" | "scores" | "classifies",
          status: "warning",
          message: `Nu se poate valida — lipsește valoarea elementului`,
        });
        continue;
      }

      const matchedRow = findInRefTable(tableData, lookupKey, lookupValue);

      if (refLink.usage === "validates") {
        refTableResults.push({
          tableName: refTable.name,
          usage: "validates",
          status: matchedRow ? "passed" : "failed",
          message: matchedRow
            ? `Valoare validată în ${refTable.name}`
            : `Valoarea "${lookupValue}" nu a fost găsită în ${refTable.name}`,
          matchedRow: matchedRow || undefined,
        });
      } else if (refLink.usage === "scores") {
        refTableResults.push({
          tableName: refTable.name,
          usage: "scores",
          status: matchedRow ? "passed" : "warning",
          message: matchedRow
            ? `Scor din ${refTable.name}: ${JSON.stringify(matchedRow)}`
            : `Nu s-a găsit scor pentru "${lookupValue}" în ${refTable.name}`,
          matchedRow: matchedRow || undefined,
        });
      } else {
        refTableResults.push({
          tableName: refTable.name,
          usage: "classifies",
          status: matchedRow ? "info" : "warning",
          message: matchedRow
            ? `Clasificare: ${JSON.stringify(matchedRow)}`
            : `Valoarea "${lookupValue}" nu apare în clasificarea ${refTable.name}`,
          matchedRow: matchedRow || undefined,
        });
      }
    }

    // Evaluate rule — only if we have the data to verify it
    if (companyDataKeys.has(condition.field)) {
      const result = evaluateFixedRule(rule, companyData);

      // If fixed rule passed but reference table says failed, override to failed
      let finalStatus = result.status;
      let finalNotes = result.notes;
      const refFailed = refTableResults.find(r => r.status === "failed");
      if (refFailed && result.status === "passed") {
        finalStatus = "failed";
        finalNotes = `${result.notes} | ${refFailed.message}`;
      } else if (refFailed && result.status !== "failed") {
        finalNotes = `${result.notes || ""} | ${refFailed.message}`.trim();
      }

      results.push({
        id: rule.id,
        type: "fixed",
        description: rule.description,
        category: rule.category,
        status: finalStatus,
        autoResult: finalStatus === "passed" ? true : finalStatus === "failed" ? false : null,
        notes: finalNotes,
        condition: rule.condition,
        sourceDocument: { id: rule.documentId, name: rule.documentName },
        elements,
        refTableResults,
      });
    }
    // Rules where we don't have data are simply NOT included —
    // consultant sees only verified rules (passed/failed), not pending ones
  }

  // 11. Build summary — only verified rules (passed/failed), clear verdict
  const totalSessionRules = allRules.length;
  const passedCount = results.filter(r => r.status === "passed").length;
  const failedCount = results.filter(r => r.status === "failed").length;

  const summary: PreEligibilitySummary = {
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    pending: 0,
    notApplicable: 0,
    fixed: {
      total: results.length,
      passed: passedCount,
      failed: failedCount,
      pending: 0,
    },
    interpreted: {
      total: 0,
      passed: 0,
      failed: 0,
      pending: 0,
    },
    missingElements: [],
    totalSessionRules,
    skippedProjectRules: totalSessionRules - results.length,
  } as PreEligibilitySummary;

  return { rules: results, summary, companyDataUsed: companyData };
}
