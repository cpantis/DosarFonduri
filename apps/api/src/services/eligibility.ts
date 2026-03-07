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
  });
  if (!project) return;

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, project.companyId),
  });
  if (!company) return;

  // Find ALL guide folders in this project's session
  const sessionFolders = await db.query.documentFolders.findMany({
    where: and(
      eq(documentFolders.parentId, project.folderId),
      eq(documentFolders.type, "ghiduri"),
    ),
  });

  // Collect ALL rules (fixed + interpreted) from ALL guides
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

  // Get company financials
  const latestFinancial = await db.query.companyFinancials.findFirst({
    where: eq(companyFinancials.companyId, company.id),
    orderBy: (f, { desc }) => [desc(f.year)],
  });

  // Data for automatic verification (fixed rules)
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

  // Get all financials for interpreted rules
  const allFinancials = await db.query.companyFinancials.findMany({
    where: eq(companyFinancials.companyId, company.id),
    orderBy: (f, { desc }) => [desc(f.year)],
  });

  // Delete old eligibility results
  await db.delete(projectEligibility).where(eq(projectEligibility.projectId, projectId));

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
        passed = fieldValue >= low && fieldValue <= high;
        break;
      }
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

  // Insert results
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

// === EVALUATE INTERPRETED RULES WITH OPUS + ET ===
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
    const response = await anthropic.messages.create(requestParams);

    const textBlock = response.content.find((b: any) => b.type === "text");
    const content = textBlock ? (textBlock as any).text : "[]";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const evaluations = JSON.parse(cleaned);

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
