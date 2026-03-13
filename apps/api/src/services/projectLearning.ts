import { db } from "../db";
import {
  projects, projectElements, projectEligibility,
  templateElements, documentFolders, companies, rules,
} from "../db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Learns from previously approved projects in the same organization
 * to provide suggestions for the current project.
 *
 * Strategy:
 * 1. Find approved projects on the same program/session
 * 2. Extract common element values, budget patterns, successful approaches
 * 3. Return actionable suggestions
 */
export async function getApprovedProjectLearnings(
  projectId: string,
  organizationId: string,
): Promise<{
  similarProjects: Array<{
    id: string;
    name: string;
    companyName: string;
    status: string;
    approvedAt: string;
  }>;
  elementSuggestions: Array<{
    elementKey: string;
    elementLabel: string;
    currentValue: string | null;
    suggestedValues: Array<{
      value: string;
      fromProject: string;
      frequency: number;
    }>;
  }>;
  budgetPatterns: {
    avgBudget: number | null;
    minBudget: number | null;
    maxBudget: number | null;
    avgCofinancingPct: number | null;
  };
  eligibilityInsights: Array<{
    ruleDescription: string;
    commonOutcome: "passed" | "failed";
    successRate: number;
    tip: string;
  }>;
  totalApprovedSimilar: number;
}> {
  // Get current project
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) {
    return { similarProjects: [], elementSuggestions: [], budgetPatterns: { avgBudget: null, minBudget: null, maxBudget: null, avgCofinancingPct: null }, eligibilityInsights: [], totalApprovedSimilar: 0 };
  }

  // Find the session folder's parent chain to match same program/measure
  const sessionFolder = await db.query.documentFolders.findFirst({
    where: eq(documentFolders.id, project.folderId),
  });
  const parentMeasureId = sessionFolder?.parentId;

  // Find all approved/submitted projects in same org, preferring same measure
  const allOrgProjects = await db.query.projects.findMany({
    where: and(
      eq(projects.organizationId, organizationId),
    ),
    orderBy: (p, { desc }) => [desc(p.updatedAt)],
  });

  const approvedProjects = allOrgProjects.filter(p =>
    p.id !== projectId &&
    (p.status === "approved" || p.status === "submitted")
  );

  // Sort by relevance: same session > same measure > same org
  const scored = await Promise.all(approvedProjects.map(async (p) => {
    let relevanceScore = 1;
    if (p.folderId === project.folderId) relevanceScore = 10; // same session
    else {
      const pFolder = await db.query.documentFolders.findFirst({
        where: eq(documentFolders.id, p.folderId),
      });
      if (pFolder?.parentId === parentMeasureId) relevanceScore = 5; // same measure
    }
    return { ...p, relevanceScore };
  }));

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const relevantProjects = scored.slice(0, 20); // limit to 20 most relevant

  // Get company names
  const similarProjects = await Promise.all(
    relevantProjects.slice(0, 5).map(async (p) => {
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, p.companyId),
      });
      return {
        id: p.id,
        name: p.name,
        companyName: company?.denumire || "—",
        status: p.status,
        approvedAt: p.updatedAt?.toISOString() || "",
      };
    })
  );

  // Get current project elements
  const currentElements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  const currentElementsEnriched = await Promise.all(currentElements.map(async (el) => {
    const templateEl = el.templateElementId ? await db.query.templateElements.findFirst({
      where: eq(templateElements.id, el.templateElementId),
    }) : null;
    return { ...el, templateElement: templateEl };
  }));

  // Empty/missing elements to suggest values for
  const emptyElements = currentElementsEnriched.filter(el =>
    !el.value || el.value.trim() === ""
  );

  // Collect values from approved projects for matching template elements
  const elementSuggestions: Array<{
    elementKey: string;
    elementLabel: string;
    currentValue: string | null;
    suggestedValues: Array<{ value: string; fromProject: string; frequency: number }>;
  }> = [];

  for (const el of emptyElements.slice(0, 30)) { // limit to 30 elements
    if (!el.templateElement) continue;

    const valueMap = new Map<string, { value: string; projects: string[]; count: number }>();

    for (const approvedProject of relevantProjects) {
      const approvedElements = await db.query.projectElements.findMany({
        where: eq(projectElements.projectId, approvedProject.id),
      });

      for (const ae of approvedElements) {
        if (ae.templateElementId === el.templateElementId && ae.value && ae.value.trim()) {
          const existing = valueMap.get(ae.value);
          if (existing) {
            existing.count++;
            existing.projects.push(approvedProject.name);
          } else {
            valueMap.set(ae.value, {
              value: ae.value,
              projects: [approvedProject.name],
              count: 1,
            });
          }
        }
      }
    }

    if (valueMap.size > 0) {
      const suggestions = Array.from(valueMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(v => ({
          value: v.value,
          fromProject: v.projects[0],
          frequency: v.count,
        }));

      elementSuggestions.push({
        elementKey: el.templateElement.key,
        elementLabel: el.templateElement.label,
        currentValue: el.value,
        suggestedValues: suggestions,
      });
    }
  }

  // Budget patterns from approved projects
  const budgetValues = relevantProjects
    .map(p => p.valoare ? parseFloat(p.valoare) : null)
    .filter((v): v is number => v !== null && !isNaN(v) && v > 0);

  const budgetPatterns = {
    avgBudget: budgetValues.length > 0 ? Math.round(budgetValues.reduce((a, b) => a + b, 0) / budgetValues.length) : null,
    minBudget: budgetValues.length > 0 ? Math.min(...budgetValues) : null,
    maxBudget: budgetValues.length > 0 ? Math.max(...budgetValues) : null,
    avgCofinancingPct: null as number | null, // would need to compute from elements
  };

  // Eligibility insights
  const eligibilityInsights: Array<{
    ruleDescription: string;
    commonOutcome: "passed" | "failed";
    successRate: number;
    tip: string;
  }> = [];

  // Get current project's failed/pending eligibility rules
  const currentElig = await db.query.projectEligibility.findMany({
    where: eq(projectEligibility.projectId, projectId),
  });

  const failedOrPending = currentElig.filter(e => e.status === "failed" || e.status === "pending");

  for (const elig of failedOrPending.slice(0, 10)) {
    let passCount = 0;
    let totalCount = 0;

    for (const approvedProject of relevantProjects) {
      const approvedElig = await db.query.projectEligibility.findMany({
        where: and(
          eq(projectEligibility.projectId, approvedProject.id),
          eq(projectEligibility.ruleId, elig.ruleId),
        ),
      });
      for (const ae of approvedElig) {
        totalCount++;
        if (ae.status === "passed") passCount++;
      }
    }

    if (totalCount > 0) {
      const rule = await db.query.rules.findFirst({
        where: eq(rules.id, elig.ruleId),
      });
      const successRate = Math.round((passCount / totalCount) * 100);

      eligibilityInsights.push({
        ruleDescription: rule?.description || "Regulă necunoscută",
        commonOutcome: passCount > totalCount / 2 ? "passed" : "failed",
        successRate,
        tip: successRate > 70
          ? `${successRate}% din proiectele aprobate similare au trecut această regulă. Verifică datele firmei.`
          : `Doar ${successRate}% au trecut — regulă dificilă. Consultă un expert.`,
      });
    }
  }

  return {
    similarProjects,
    elementSuggestions,
    budgetPatterns,
    eligibilityInsights,
    totalApprovedSimilar: relevantProjects.length,
  };
}
