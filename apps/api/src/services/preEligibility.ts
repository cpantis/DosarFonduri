import { db } from "../db";
import {
  companies, companyFinancials, companyElements, documentFolders,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import {
  buildCompanyData, overlayCompanyElements, getRulesForSession,
  evaluateFixedRule, evaluateInterpretedRules,
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
  options?: { includeInterpreted?: boolean },
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
      },
      companyDataUsed: companyData,
    };
  }

  // 7. Evaluate fixed rules
  const fixedRules = allRules.filter(r => r.type === "fixed");
  const interpretedRules = allRules.filter(r => r.type === "interpreted");

  const results: PreEligibilityRule[] = [];

  for (const rule of fixedRules) {
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

  // 8. Optionally evaluate interpreted rules (AI — slower)
  if (options?.includeInterpreted && interpretedRules.length > 0) {
    const interpretedResults = await evaluateInterpretedRules(
      interpretedRules,
      company,
      allFinancials,
      companyData,
      organizationId,
    );
    for (let i = 0; i < interpretedRules.length; i++) {
      const rule = interpretedRules[i];
      const result = interpretedResults[i];
      results.push({
        id: rule.id,
        type: "interpreted",
        description: rule.description,
        category: rule.category,
        status: result.status,
        autoResult: result.autoResult,
        notes: result.notes,
        condition: rule.condition,
        sourceDocument: { id: rule.documentId, name: rule.documentName },
      });
    }
  } else {
    // Mark interpreted rules as pending (not evaluated)
    for (const rule of interpretedRules) {
      results.push({
        id: rule.id,
        type: "interpreted",
        description: rule.description,
        category: rule.category,
        status: "pending",
        autoResult: null,
        notes: "Regulă interpretată — necesită evaluare AI (activați opțiunea)",
        condition: rule.condition,
        sourceDocument: { id: rule.documentId, name: rule.documentName },
      });
    }
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
