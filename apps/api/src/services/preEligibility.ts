import { db } from "../db";
import {
  companies, companyFinancials, companyElements, documentFolders,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import {
  buildCompanyData, overlayCompanyElements, getRulesForSession,
  evaluateFixedRule,
} from "./eligibility";

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
}

export interface PreEligibilitySummary {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  notApplicable: number;
  fixed: { total: number; passed: number; failed: number; pending: number };
  interpreted: { total: number; passed: number; failed: number; pending: number };
}

export interface PreEligibilityResult {
  rules: PreEligibilityRule[];
  summary: PreEligibilitySummary;
  companyDataUsed: Record<string, any>;
}

/**
 * Run pre-eligibility check for a company against a session's rules.
 * Does NOT persist results — returns them ephemerally.
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

  // 7. Filter to company-relevant rules only.
  // Pre-eligibility checks ONLY rules that can be verified from company data
  // (legal form, financials, location, age, CAEN, etc.) — not project-specific rules.
  const companyDataKeys = new Set(Object.keys(companyData));
  const companyRelevantRules = allRules.filter(r => {
    if (r.type !== "fixed") return false; // Only fixed rules can be auto-evaluated
    const condition = r.condition as any;
    if (!condition || !condition.field) return false;
    return companyDataKeys.has(condition.field);
  });

  if (companyRelevantRules.length === 0) {
    return {
      rules: [],
      summary: {
        total: 0, passed: 0, failed: 0, pending: 0, notApplicable: 0,
        fixed: { total: 0, passed: 0, failed: 0, pending: 0 },
        interpreted: { total: 0, passed: 0, failed: 0, pending: 0 },
      },
      companyDataUsed: companyData,
    };
  }

  // 8. Evaluate only company-relevant fixed rules
  const results: PreEligibilityRule[] = [];

  for (const rule of companyRelevantRules) {
    const result = evaluateFixedRule(rule, companyData);
    results.push({
      id: rule.id,
      type: "fixed",
      description: rule.description,
      category: rule.category,
      status: result.status,
      autoResult: result.autoResult,
      notes: result.notes,
      condition: rule.condition,
      sourceDocument: { id: rule.documentId, name: rule.documentName },
    });
  }

  // 9. Build summary
  const fixedResults = results.filter(r => r.type === "fixed");
  const interpResults = results.filter(r => r.type === "interpreted");

  const summary: PreEligibilitySummary = {
    total: results.length,
    passed: results.filter(r => r.status === "passed").length,
    failed: results.filter(r => r.status === "failed").length,
    pending: results.filter(r => r.status === "pending").length,
    notApplicable: results.filter(r => r.status === "not_applicable").length,
    fixed: {
      total: fixedResults.length,
      passed: fixedResults.filter(r => r.status === "passed").length,
      failed: fixedResults.filter(r => r.status === "failed").length,
      pending: fixedResults.filter(r => r.status === "pending").length,
    },
    interpreted: {
      total: interpResults.length,
      passed: interpResults.filter(r => r.status === "passed").length,
      failed: interpResults.filter(r => r.status === "failed").length,
      pending: interpResults.filter(r => r.status === "pending").length,
    },
  };

  return { rules: results, summary, companyDataUsed: companyData };
}
