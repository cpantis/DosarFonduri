import { db } from "../db";
import {
  scoringCriteria, projectScores, projectElements, templateElements,
  projects, documentFolders, documents, guideReferenceTables,
} from "../db/schema";
import { eq, and } from "drizzle-orm";

// Safe arithmetic evaluator — recursive descent parser for +, -, *, /, ()
// No eval/Function — immune to code injection
function safeEvalArithmetic(expr: string): number | null {
  const tokens: string[] = [];
  const cleaned = expr.replace(/\s+/g, "");

  // Tokenize: numbers (including decimals) and operators
  let i = 0;
  while (i < cleaned.length) {
    const ch = cleaned[i];
    if ("0123456789.".includes(ch)) {
      let num = "";
      while (i < cleaned.length && "0123456789.".includes(cleaned[i])) {
        num += cleaned[i++];
      }
      tokens.push(num);
    } else if ("+-*/()".includes(ch)) {
      tokens.push(ch);
      i++;
    } else {
      return null; // Invalid character
    }
  }

  let pos = 0;

  function parseExpr(): number {
    let result = parseTerm();
    while (pos < tokens.length && (tokens[pos] === "+" || tokens[pos] === "-")) {
      const op = tokens[pos++];
      const right = parseTerm();
      result = op === "+" ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (pos < tokens.length && (tokens[pos] === "*" || tokens[pos] === "/")) {
      const op = tokens[pos++];
      const right = parseFactor();
      result = op === "*" ? result * right : (right !== 0 ? result / right : NaN);
    }
    return result;
  }

  function parseFactor(): number {
    // Handle unary minus
    if (tokens[pos] === "-") {
      pos++;
      return -parseFactor();
    }
    if (tokens[pos] === "(") {
      pos++; // skip (
      const result = parseExpr();
      if (tokens[pos] === ")") pos++; // skip )
      return result;
    }
    const num = parseFloat(tokens[pos++]);
    if (isNaN(num)) return NaN;
    return num;
  }

  try {
    const result = parseExpr();
    if (pos !== tokens.length || isNaN(result) || !isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

interface ScoreResult {
  criteriaId: string;
  code: string;
  name: string;
  points: number | null;
  maxPoints: number;
  reasoning: string;
  inputElements: Record<string, any>;
}

// --- Evaluate a Single Scoring Criterion ---

async function evaluateCriterion(
  criteria: typeof scoringCriteria.$inferSelect,
  elementMap: Map<string, string | null>,
): Promise<ScoreResult> {
  const logic = criteria.evaluationLogic as {
    type: "lookup" | "range" | "boolean" | "formula";
    elementKey?: string;
    referenceTableId?: string;
    lookupColumn?: string;
    ranges?: Array<{ min?: number; max?: number; points: number }>;
    formula?: string;
  } | null;

  const maxPoints = parseFloat(criteria.maxPoints.toString());
  const base = {
    criteriaId: criteria.id,
    code: criteria.code,
    name: criteria.name,
    maxPoints,
  };

  if (!logic || !logic.elementKey) {
    return { ...base, points: null, reasoning: "Logica de evaluare nu este configurată", inputElements: {} };
  }

  const rawValue = elementMap.get(logic.elementKey);
  if (!rawValue || rawValue.trim() === "") {
    return {
      ...base,
      points: null,
      reasoning: `Elementul "${logic.elementKey}" nu are valoare`,
      inputElements: { [logic.elementKey]: null },
    };
  }

  const numValue = parseFloat(rawValue.replace(/\s/g, "").replace(",", "."));
  const inputs: Record<string, any> = { [logic.elementKey]: rawValue };

  switch (logic.type) {
    case "boolean": {
      const truthy = ["da", "yes", "true", "1", "adevărat"].includes(rawValue.toLowerCase().trim());
      return {
        ...base,
        points: truthy ? maxPoints : 0,
        reasoning: truthy
          ? `"${rawValue}" → DA → ${maxPoints}p`
          : `"${rawValue}" → NU → 0p`,
        inputElements: inputs,
      };
    }

    case "range": {
      if (!logic.ranges || isNaN(numValue)) {
        return { ...base, points: null, reasoning: "Range-uri neconfigure sau valoare non-numerică", inputElements: inputs };
      }
      for (const range of logic.ranges) {
        const min = range.min ?? -Infinity;
        const max = range.max ?? Infinity;
        if (numValue >= min && numValue <= max) {
          return {
            ...base,
            points: range.points,
            reasoning: `${numValue} ∈ [${range.min ?? "−∞"}, ${range.max ?? "∞"}] → ${range.points}p`,
            inputElements: inputs,
          };
        }
      }
      return { ...base, points: 0, reasoning: `${numValue} nu se încadrează în niciun interval → 0p`, inputElements: inputs };
    }

    case "lookup": {
      if (!logic.referenceTableId) {
        return { ...base, points: null, reasoning: "Tabel de referință neconfigurat", inputElements: inputs };
      }
      const refTable = await db.query.guideReferenceTables.findFirst({
        where: eq(guideReferenceTables.id, logic.referenceTableId),
      });
      if (!refTable || !refTable.data) {
        return { ...base, points: null, reasoning: "Tabelul de referință nu conține date", inputElements: inputs };
      }

      const tableData = refTable.data as Array<Record<string, any>>;
      const lookupKey = refTable.lookupKey || "key";
      const pointsCol = logic.lookupColumn || "points";
      const searchValue = rawValue.toLowerCase().trim();
      const searchNum = parseFloat(searchValue.replace(",", "."));

      // Try exact match
      let matchedRow = tableData.find(row =>
        String(row[lookupKey] || "").toLowerCase().trim() === searchValue
      );

      // Try numeric range match
      if (!matchedRow && !isNaN(searchNum)) {
        matchedRow = tableData.find(row => {
          const cellValue = String(row[lookupKey] || "");
          const rangeMatch = cellValue.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/);
          if (rangeMatch) {
            const low = parseFloat(rangeMatch[1].replace(",", "."));
            const high = parseFloat(rangeMatch[2].replace(",", "."));
            return searchNum >= low && searchNum <= high;
          }
          return false;
        });
      }

      if (!matchedRow) {
        return { ...base, points: 0, reasoning: `"${rawValue}" nu a fost găsit în ${refTable.name} → 0p`, inputElements: inputs };
      }

      const pointsValue = parseFloat(String(matchedRow[pointsCol] || "0").replace(",", "."));
      const clampedPoints = Math.min(pointsValue, maxPoints);

      return {
        ...base,
        points: clampedPoints,
        reasoning: `"${rawValue}" → ${refTable.name} → ${clampedPoints}p (row: ${JSON.stringify(matchedRow)})`,
        inputElements: { ...inputs, matchedRow },
      };
    }

    case "formula": {
      // Simple formula evaluation — supports basic arithmetic with element references
      if (!logic.formula) {
        return { ...base, points: null, reasoning: "Formula nu este configurată", inputElements: inputs };
      }

      // Collect all element values referenced in formula
      let formulaStr = logic.formula;
      const elementRefs = formulaStr.match(/\{(\w+)\}/g) || [];
      for (const ref of elementRefs) {
        const key = ref.slice(1, -1);
        const val = elementMap.get(key);
        if (!val) {
          return { ...base, points: null, reasoning: `Elementul "${key}" nu are valoare pentru formulă`, inputElements: inputs };
        }
        const numVal = parseFloat(val.replace(/\s/g, "").replace(",", "."));
        if (isNaN(numVal)) {
          return { ...base, points: null, reasoning: `Elementul "${key}" nu este numeric`, inputElements: inputs };
        }
        formulaStr = formulaStr.replace(ref, String(numVal));
        inputs[key] = val;
      }

      try {
        // Safe arithmetic evaluator — no Function()/eval(), only parses numbers and +-*/()
        const result = safeEvalArithmetic(formulaStr);
        if (result === null) {
          return { ...base, points: null, reasoning: `Formula invalidă: ${logic.formula}`, inputElements: inputs };
        }
        const points = Math.min(Math.max(0, result), maxPoints);
        return {
          ...base,
          points,
          reasoning: `Formula: ${logic.formula} = ${result} → ${points}p`,
          inputElements: inputs,
        };
      } catch {
        return { ...base, points: null, reasoning: `Eroare la evaluarea formulei: ${logic.formula}`, inputElements: inputs };
      }
    }

    default:
      return { ...base, points: null, reasoning: "Tip de evaluare necunoscut", inputElements: {} };
  }
}

// --- Main Scoring Function ---

export async function computeProjectScores(projectId: string): Promise<{
  scores: ScoreResult[];
  totalPoints: number;
  maxTotalPoints: number;
  percentage: number;
}> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) {
    return { scores: [], totalPoints: 0, maxTotalPoints: 0, percentage: 0 };
  }

  // Find scoring criteria from session guides
  const sessionFolders = await db.query.documentFolders.findMany({
    where: and(
      eq(documentFolders.parentId, project.folderId),
      eq(documentFolders.type, "ghiduri"),
    ),
  });

  const allCriteria: (typeof scoringCriteria.$inferSelect)[] = [];
  for (const folder of sessionFolders) {
    const docs = await db.query.documents.findMany({
      where: eq(documents.folderId, folder.id),
    });
    for (const doc of docs) {
      const criteria = await db.query.scoringCriteria.findMany({
        where: eq(scoringCriteria.documentId, doc.id),
      });
      allCriteria.push(...criteria);
    }
  }

  if (allCriteria.length === 0) {
    return { scores: [], totalPoints: 0, maxTotalPoints: 0, percentage: 0 };
  }

  // Build element value map
  const elements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  const elementMap = new Map<string, string | null>();
  for (const el of elements) {
    if (!el.templateElementId) continue;
    const tmplEl = await db.query.templateElements.findFirst({
      where: eq(templateElements.id, el.templateElementId),
    });
    if (tmplEl) {
      elementMap.set(tmplEl.key, el.value);
    }
  }

  // Evaluate each criterion
  const scores: ScoreResult[] = [];
  for (const criteria of allCriteria.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))) {
    const result = await evaluateCriterion(criteria, elementMap);
    scores.push(result);
  }

  // Save scores to DB
  // Delete existing scores and insert new ones atomically
  await db.transaction(async (tx) => {
    await tx.delete(projectScores).where(eq(projectScores.projectId, projectId));

    if (scores.length > 0) {
      await tx.insert(projectScores).values(
        scores.map(s => ({
          projectId,
          criteriaId: s.criteriaId,
          points: s.points !== null ? String(s.points) : null,
          maxPoints: String(s.maxPoints),
          reasoning: s.reasoning,
          inputElements: s.inputElements,
        }))
      );
    }
  });

  const totalPoints = scores.reduce((sum, s) => sum + (s.points || 0), 0);
  const maxTotalPoints = scores.reduce((sum, s) => sum + s.maxPoints, 0);

  return {
    scores,
    totalPoints,
    maxTotalPoints,
    percentage: maxTotalPoints > 0 ? Math.round((totalPoints / maxTotalPoints) * 100) : 0,
  };
}
