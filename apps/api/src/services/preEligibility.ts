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

  // 9. Determine which fields are company-relevant (for filtering)
  // Core companyData keys are always relevant
  const companyDataKeys = new Set(Object.keys(companyData));
  // Also identify element categories that are company-relevant (not project/investment)
  const companyRelevantCategories = new Set(["financial", "legal", "beneficiary", "location", "farm", "other"]);
  // Build set of company-relevant field keys from element definitions
  const companyRelevantFields = new Set<string>(companyDataKeys);
  for (const ed of orgElemDefs) {
    if (!ed.category || companyRelevantCategories.has(ed.category)) {
      companyRelevantFields.add(ed.elementKey.toLowerCase());
    }
  }

  // 10. Evaluate rules — only include rules relevant to company data
  const results: PreEligibilityRule[] = [];
  const allMissingElements: string[] = [];

  for (const rule of allRules) {
    const condition = rule.condition as any;

    // Skip interpreted rules entirely (need AI + project context)
    if (rule.type === "interpreted") continue;

    // Skip fixed rules with no condition (nothing to check)
    if (!condition?.field) continue;

    // Skip rules whose condition.field is NOT company-relevant
    const fieldKey = String(condition.field).toLowerCase();
    if (!companyRelevantFields.has(fieldKey)) continue;

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

    // Evaluate rule — we already filtered to fixed rules with condition.field
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
    } else {
      // Company-relevant field but data not yet available — pending
      if (!allMissingElements.includes(fieldKey)) {
        allMissingElements.push(fieldKey);
      }
      results.push({
        id: rule.id,
        type: "fixed",
        description: rule.description,
        category: rule.category,
        status: "pending",
        autoResult: null,
        notes: `Date lipsă: ${condition.field}`,
        condition: rule.condition,
        sourceDocument: { id: rule.documentId, name: rule.documentName },
        elements,
        refTableResults,
      });
    }
  }

  // 11. Build summary
  // Count original totals for reporting
  const totalSessionRules = allRules.length;
  const interpretedCount = allRules.filter(r => r.type === "interpreted").length;
  const skippedProjectRules = totalSessionRules - interpretedCount - results.length;

  const summary: PreEligibilitySummary = {
    total: results.length,
    passed: results.filter(r => r.status === "passed").length,
    failed: results.filter(r => r.status === "failed").length,
    pending: results.filter(r => r.status === "pending").length,
    notApplicable: results.filter(r => r.status === "not_applicable").length,
    fixed: {
      total: results.length,
      passed: results.filter(r => r.status === "passed").length,
      failed: results.filter(r => r.status === "failed").length,
      pending: results.filter(r => r.status === "pending").length,
    },
    interpreted: {
      total: interpretedCount,
      passed: 0,
      failed: 0,
      pending: interpretedCount,
    },
    missingElements: allMissingElements,
    totalSessionRules,
    skippedProjectRules,
  } as PreEligibilitySummary;

  return { rules: results, summary, companyDataUsed: companyData };
}
