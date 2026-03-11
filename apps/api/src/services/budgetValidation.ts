import { db } from "../db";
import {
  projects, projectElements, templateElements, rules,
  companyFinancials, companies, documentFolders, documents,
  guideReferenceTables, ruleReferenceLinks,
} from "../db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Budget validation result for a single line item or total.
 */
export interface BudgetValidationResult {
  key: string;
  label: string;
  value: number | null;
  validations: BudgetCheck[];
  status: "valid" | "warning" | "invalid";
}

interface BudgetCheck {
  check: string;
  passed: boolean;
  message: string;
  severity: "error" | "warning" | "info";
}

interface BudgetRow {
  key: string;
  label: string;
  value: number | null;
  category?: string;
}

/**
 * Complete budget validation for a project.
 * Validates against:
 * 1. Guide rules (min/max thresholds from extracted rules)
 * 2. Reference tables (eligible expense categories, co-financing rates)
 * 3. Financial consistency (totals match sums, percentages add up)
 * 4. Company financials (budget vs turnover ratios)
 */
export async function validateBudget(projectId: string): Promise<{
  results: BudgetValidationResult[];
  summary: {
    totalBudget: number;
    eligibleAmount: number;
    coFinancingAmount: number;
    coFinancingPct: number;
    grantAmount: number;
    grantPct: number;
    totalErrors: number;
    totalWarnings: number;
    status: "valid" | "warning" | "invalid";
  };
}> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) throw new Error("Project not found");

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, project.companyId),
  });

  // Get all project elements with their template element metadata
  const elements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  const enrichedElements = await Promise.all(elements.map(async (el) => {
    const templateEl = await db.query.templateElements.findFirst({
      where: eq(templateElements.id, el.templateElementId),
    });
    return { ...el, templateElement: templateEl };
  }));

  // Extract budget-related elements (numeric values with budget-like keys)
  const budgetElements = enrichedElements.filter(el => {
    const key = el.templateElement?.key || "";
    const fieldType = el.templateElement?.fieldType;
    return fieldType === "number" || key.match(/buget|valoare|cost|cheltuial|grant|cofinant|eligibil|total|suma/i);
  });

  const budgetRows: BudgetRow[] = budgetElements.map(el => ({
    key: el.templateElement?.key || "",
    label: el.templateElement?.label || el.templateElement?.key || "",
    value: el.value ? parseFloat(el.value) : null,
    category: el.templateElement?.group || undefined,
  }));

  // Get guide rules relevant to budget
  const guideFolders = await db.query.documentFolders.findMany({
    where: and(
      eq(documentFolders.parentId, project.folderId),
      eq(documentFolders.type, "ghiduri"),
    ),
  });

  const budgetRules: Array<typeof rules.$inferSelect> = [];
  for (const folder of guideFolders) {
    const docs = await db.query.documents.findMany({
      where: eq(documents.folderId, folder.id),
    });
    for (const doc of docs) {
      const docRules = await db.query.rules.findMany({
        where: eq(rules.documentId, doc.id),
      });
      budgetRules.push(...docRules.filter(r =>
        r.category === "financiar" ||
        r.category === "achizitii" ||
        (r.description || "").toLowerCase().match(/buget|valoare|cheltuial|cofinant|eligibil|intensitat|ajutor|minimis/)
      ));
    }
  }

  // Get reference tables for expense category validation
  const refTables: Array<typeof guideReferenceTables.$inferSelect> = [];
  for (const folder of guideFolders) {
    const docs = await db.query.documents.findMany({
      where: eq(documents.folderId, folder.id),
    });
    for (const doc of docs) {
      const tables = await db.query.guideReferenceTables.findMany({
        where: eq(guideReferenceTables.documentId, doc.id),
      });
      refTables.push(...tables);
    }
  }

  // Get company financials for ratio validation
  const latestFinancial = await db.query.companyFinancials.findFirst({
    where: eq(companyFinancials.companyId, project.companyId),
    orderBy: (f, { desc }) => [desc(f.year)],
  });

  const results: BudgetValidationResult[] = [];

  // Identify totals and sub-items
  const totalBudgetEl = budgetRows.find(r => r.key.match(/total.*buget|buget.*total|valoare.*totala|total.*proiect/i));
  const eligibleEl = budgetRows.find(r => r.key.match(/eligibil|cheltuieli.*eligibil/i));
  const grantEl = budgetRows.find(r => r.key.match(/grant|finantare.*nerambursabil|ajutor/i));
  const cofinancingEl = budgetRows.find(r => r.key.match(/cofinant|contributie.*proprie/i));
  const tvaEl = budgetRows.find(r => r.key.match(/tva|taxa.*valoare/i));

  const totalBudget = totalBudgetEl?.value || 0;
  const eligibleAmount = eligibleEl?.value || totalBudget;
  const grantAmount = grantEl?.value || 0;
  const cofinancingAmount = cofinancingEl?.value || 0;

  // === VALIDATION 1: Basic consistency checks ===
  for (const row of budgetRows) {
    const checks: BudgetCheck[] = [];

    // Non-negative check
    if (row.value !== null && row.value < 0) {
      checks.push({
        check: "non_negative",
        passed: false,
        message: `Valoarea ${row.label} nu poate fi negativă (${row.value})`,
        severity: "error",
      });
    }

    // Zero-value warning for required fields
    if (row.value === 0 && row.key.match(/total|buget|valoare/i)) {
      checks.push({
        check: "non_zero",
        passed: false,
        message: `${row.label} este 0 — verifică dacă este corect`,
        severity: "warning",
      });
    }

    // Missing value
    if (row.value === null) {
      checks.push({
        check: "has_value",
        passed: false,
        message: `${row.label} nu are valoare completată`,
        severity: "warning",
      });
    }

    if (checks.length > 0) {
      results.push({
        key: row.key,
        label: row.label,
        value: row.value,
        validations: checks,
        status: checks.some(c => !c.passed && c.severity === "error") ? "invalid" :
                checks.some(c => !c.passed && c.severity === "warning") ? "warning" : "valid",
      });
    }
  }

  // === VALIDATION 2: Grant + co-financing = total ===
  if (totalBudget > 0 && grantAmount > 0 && cofinancingAmount > 0) {
    const sumParts = grantAmount + cofinancingAmount;
    const diff = Math.abs(sumParts - totalBudget);
    const tolerance = totalBudget * 0.01; // 1% tolerance for rounding

    if (diff > tolerance) {
      results.push({
        key: "_sum_check",
        label: "Verificare sume",
        value: diff,
        validations: [{
          check: "sum_consistency",
          passed: false,
          message: `Finanțare (${grantAmount.toLocaleString("ro-RO")}) + Cofinanțare (${cofinancingAmount.toLocaleString("ro-RO")}) = ${sumParts.toLocaleString("ro-RO")} ≠ Total buget (${totalBudget.toLocaleString("ro-RO")}). Diferență: ${diff.toLocaleString("ro-RO")}`,
          severity: "error",
        }],
        status: "invalid",
      });
    }
  }

  // === VALIDATION 3: Apply guide rules ===
  for (const rule of budgetRules) {
    const condition = rule.condition as any;
    if (!condition) continue;

    // Fixed rules with budget field references
    if (rule.type === "fixed" && condition.field) {
      const matchingRow = budgetRows.find(r =>
        r.key.toLowerCase().includes(condition.field.toLowerCase()) ||
        condition.field.toLowerCase().includes(r.key.toLowerCase())
      );

      if (matchingRow && matchingRow.value !== null) {
        let passed = false;
        const condVal = parseFloat(condition.value);
        const condVal2 = condition.value2 ? parseFloat(condition.value2) : NaN;

        switch (condition.operator) {
          case "gt": passed = matchingRow.value > condVal; break;
          case "gte": passed = matchingRow.value >= condVal; break;
          case "lt": passed = matchingRow.value < condVal; break;
          case "lte": passed = matchingRow.value <= condVal; break;
          case "between":
            passed = !isNaN(condVal) && !isNaN(condVal2) &&
                     matchingRow.value >= condVal && matchingRow.value <= condVal2;
            break;
          case "eq": passed = matchingRow.value === condVal; break;
          default: continue;
        }

        results.push({
          key: matchingRow.key,
          label: matchingRow.label,
          value: matchingRow.value,
          validations: [{
            check: `rule_${rule.id}`,
            passed,
            message: passed
              ? `${rule.description} — ✓ Conform`
              : `${rule.description} — ✗ Neconform (valoare: ${matchingRow.value.toLocaleString("ro-RO")}, cerință: ${condition.operator} ${condition.value}${condition.value2 ? '-' + condition.value2 : ''})`,
            severity: passed ? "info" : "error",
          }],
          status: passed ? "valid" : "invalid",
        });
      }
    }

    // Interpreted rules mentioning budget thresholds
    if (rule.type === "interpreted" && condition.type === "conditional") {
      // Look for percentage-based rules (co-financing rate, grant intensity)
      const description = (rule.description || "").toLowerCase();
      if (description.match(/intensitat.*ajutor|cofinant.*minim|contributi.*propri/)) {
        // Try to extract percentage from description or condition
        const pctMatch = (rule.description || "").match(/(\d+)%/);
        if (pctMatch && totalBudget > 0 && cofinancingAmount > 0) {
          const requiredPct = parseInt(pctMatch[1]);
          const actualPct = Math.round((cofinancingAmount / totalBudget) * 100);
          const passed = actualPct >= requiredPct;

          results.push({
            key: "_cofinancing_rate",
            label: "Rată cofinanțare",
            value: actualPct,
            validations: [{
              check: `rule_${rule.id}`,
              passed,
              message: passed
                ? `Cofinanțare ${actualPct}% ≥ ${requiredPct}% cerut — ✓ Conform`
                : `Cofinanțare ${actualPct}% < ${requiredPct}% minim cerut — ✗ Neconform`,
              severity: passed ? "info" : "error",
            }],
            status: passed ? "valid" : "invalid",
          });
        }
      }
    }
  }

  // === VALIDATION 4: Company financial capacity checks ===
  if (latestFinancial && totalBudget > 0) {
    const f20 = (latestFinancial.f20 || {}) as any;
    const turnover = f20.cifraAfaceriNeta || 0;

    // Budget should not exceed a reasonable multiple of turnover
    if (turnover > 0) {
      const ratio = totalBudget / turnover;
      if (ratio > 5) {
        results.push({
          key: "_turnover_ratio",
          label: "Raport buget/cifră afaceri",
          value: Math.round(ratio * 100) / 100,
          validations: [{
            check: "turnover_ratio",
            passed: false,
            message: `Bugetul proiectului (${totalBudget.toLocaleString("ro-RO")}) este de ${ratio.toFixed(1)}x cifra de afaceri (${turnover.toLocaleString("ro-RO")}). Risc ridicat de respingere.`,
            severity: "warning",
          }],
          status: "warning",
        });
      }
    }

    // Co-financing capacity check
    const f10 = (latestFinancial.f10 || {}) as any;
    const equity = f10.capitaluriProprii || 0;
    if (cofinancingAmount > 0 && equity > 0 && cofinancingAmount > equity * 2) {
      results.push({
        key: "_equity_capacity",
        label: "Capacitate financiară",
        value: cofinancingAmount,
        validations: [{
          check: "equity_capacity",
          passed: false,
          message: `Cofinanțarea (${cofinancingAmount.toLocaleString("ro-RO")}) depășește 2x capitalurile proprii (${equity.toLocaleString("ro-RO")}). Necesită justificare suplimentară.`,
          severity: "warning",
        }],
        status: "warning",
      });
    }
  }

  // === VALIDATION 5: Reference table cross-checks ===
  for (const table of refTables) {
    const tableData = table.data as any[];
    if (!tableData || tableData.length === 0) continue;

    // Check if any budget categories match reference table lookup values
    const tableName = (table.name || "").toLowerCase();
    if (tableName.match(/cheltuieli.*eligibil|categori.*buget|intensitat/)) {
      // This table defines eligible expense limits
      for (const row of tableData) {
        const limit = parseFloat(row.max || row.maxim || row.plafon || "0");
        if (limit > 0) {
          const category = row.categorie || row.tip || row.denumire || "";
          const matchingBudgetRow = budgetRows.find(br =>
            category && br.label.toLowerCase().includes(category.toLowerCase())
          );
          if (matchingBudgetRow && matchingBudgetRow.value !== null && matchingBudgetRow.value > limit) {
            results.push({
              key: matchingBudgetRow.key,
              label: matchingBudgetRow.label,
              value: matchingBudgetRow.value,
              validations: [{
                check: `ref_table_${table.id}`,
                passed: false,
                message: `${matchingBudgetRow.label} (${matchingBudgetRow.value.toLocaleString("ro-RO")}) depășește plafonul din "${table.name}": max ${limit.toLocaleString("ro-RO")}`,
                severity: "error",
              }],
              status: "invalid",
            });
          }
        }
      }
    }
  }

  // Compute summary
  const totalErrors = results.filter(r => r.status === "invalid").length;
  const totalWarnings = results.filter(r => r.status === "warning").length;
  const grantPct = totalBudget > 0 ? Math.round((grantAmount / totalBudget) * 100) : 0;
  const coFinancingPct = totalBudget > 0 ? Math.round((cofinancingAmount / totalBudget) * 100) : 0;

  return {
    results,
    summary: {
      totalBudget,
      eligibleAmount,
      coFinancingAmount: cofinancingAmount,
      coFinancingPct,
      grantAmount,
      grantPct,
      totalErrors,
      totalWarnings,
      status: totalErrors > 0 ? "invalid" : totalWarnings > 0 ? "warning" : "valid",
    },
  };
}
