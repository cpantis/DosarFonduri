import { db } from "../db";
import {
  projectElements, templateElements, elementRuleLinks, ruleReferenceLinks,
  guideReferenceTables, rules, elementAuditLog,
} from "../db/schema";
import { eq, and } from "drizzle-orm";

// --- Types ---

interface TypeCheckResult {
  passed: boolean;
  message: string;
}

interface LookupResult {
  tableId: string;
  tableName: string;
  matched: boolean;
  matchedRow?: Record<string, any>;
  message: string;
}

interface CrossCheckResult {
  check: string;
  passed: boolean;
  message: string;
}

interface RuleResult {
  ruleId: string;
  ruleText: string;
  status: string;
  message: string;
}

export interface ValidationResult {
  status: "pending" | "valid" | "warning" | "invalid";
  details: {
    typeCheck?: TypeCheckResult;
    lookupResult?: LookupResult;
    crossChecks?: CrossCheckResult[];
    ruleResults?: RuleResult[];
  };
}

// --- Type Validation ---

function validateType(value: string | null, fieldType: string): TypeCheckResult {
  if (!value || value.trim() === "") {
    return { passed: true, message: "Valoare goală — pending" };
  }

  switch (fieldType) {
    case "number": {
      const cleaned = value.replace(/\s/g, "").replace(",", ".");
      const num = parseFloat(cleaned);
      if (isNaN(num)) {
        return { passed: false, message: `"${value}" nu este un număr valid` };
      }
      return { passed: true, message: `Număr valid: ${num}` };
    }
    case "date": {
      // Accept dd.mm.yyyy, dd/mm/yyyy, yyyy-mm-dd
      const datePatterns = [
        /^\d{2}[./]\d{2}[./]\d{4}$/,
        /^\d{4}-\d{2}-\d{2}$/,
      ];
      const isValidFormat = datePatterns.some(p => p.test(value.trim()));
      if (!isValidFormat) {
        return { passed: false, message: `"${value}" nu este o dată validă (format: dd.mm.yyyy)` };
      }
      return { passed: true, message: "Dată validă" };
    }
    case "select": {
      // Select values are always valid if non-empty
      return { passed: true, message: "Valoare selectată" };
    }
    case "text":
    case "textarea": {
      if (value.length > 10000) {
        return { passed: false, message: `Text prea lung (${value.length} caractere, max 10000)` };
      }
      return { passed: true, message: "Text valid" };
    }
    case "signature": {
      return { passed: true, message: "Semnătură" };
    }
    case "table": {
      return { passed: true, message: "Tabel" };
    }
    default:
      return { passed: true, message: "Tip necunoscut — acceptat" };
  }
}

// --- Lookup Validation ---

function performLookup(
  value: string,
  refTable: { id: string; name: string; data: Array<Record<string, any>> | null; lookupKey: string | null; tableType: string },
): LookupResult {
  if (!refTable.data || refTable.data.length === 0) {
    return {
      tableId: refTable.id,
      tableName: refTable.name,
      matched: false,
      message: `Tabelul ${refTable.name} nu are date`,
    };
  }

  const lookupKey = refTable.lookupKey || "key";
  const searchValue = value.replace(/\s/g, "").replace(",", ".").toLowerCase();
  const searchNum = parseFloat(searchValue);

  // Try exact match first
  let matchedRow = refTable.data.find(row => {
    const cellValue = String(row[lookupKey] || "").toLowerCase().trim();
    return cellValue === searchValue;
  });

  // Try numeric range match (e.g., "201-500" for value 270)
  if (!matchedRow && !isNaN(searchNum)) {
    matchedRow = refTable.data.find(row => {
      const cellValue = String(row[lookupKey] || "");
      // Check range patterns: "201-500", "10 - 50", ">500", "<10"
      const rangeMatch = cellValue.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/);
      if (rangeMatch) {
        const low = parseFloat(rangeMatch[1].replace(",", "."));
        const high = parseFloat(rangeMatch[2].replace(",", "."));
        return searchNum >= low && searchNum <= high;
      }
      const gtMatch = cellValue.match(/^[>≥]\s*(\d+(?:[.,]\d+)?)$/);
      if (gtMatch) {
        return searchNum >= parseFloat(gtMatch[1].replace(",", "."));
      }
      const ltMatch = cellValue.match(/^[<≤]\s*(\d+(?:[.,]\d+)?)$/);
      if (ltMatch) {
        return searchNum <= parseFloat(ltMatch[1].replace(",", "."));
      }
      return false;
    });
  }

  // Try fuzzy / contains match
  if (!matchedRow) {
    matchedRow = refTable.data.find(row => {
      const cellValue = String(row[lookupKey] || "").toLowerCase().trim();
      return cellValue.includes(searchValue) || searchValue.includes(cellValue);
    });
  }

  return {
    tableId: refTable.id,
    tableName: refTable.name,
    matched: !!matchedRow,
    matchedRow: matchedRow || undefined,
    message: matchedRow
      ? `✅ Găsit în ${refTable.name}: ${JSON.stringify(matchedRow)}`
      : `⚠️ Valoarea "${value}" nu a fost găsită în ${refTable.name}`,
  };
}

// --- Cross-element Validation ---

async function validateCrossElements(
  projectId: string,
  currentElementKey: string,
  currentValue: string,
): Promise<CrossCheckResult[]> {
  const results: CrossCheckResult[] = [];

  // Get all project elements with their template keys
  const allElements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  const elementMap = new Map<string, { value: string | null; id: string }>();
  for (const el of allElements) {
    if (!el.templateElementId) continue;
    const tmplEl = await db.query.templateElements.findFirst({
      where: eq(templateElements.id, el.templateElementId),
    });
    if (tmplEl) {
      elementMap.set(tmplEl.key, { value: el.value, id: el.id });
    }
  }

  // Define cross-element validation rules
  const crossRules: Array<{
    name: string;
    keys: string[];
    validate: (values: Map<string, string | null>) => { passed: boolean; message: string } | null;
  }> = [
    {
      name: "Suprafață contracte vs. exploatație",
      keys: ["suprafata_exploatatie", "suprafata_contracte", "suprafata_totala"],
      validate: (vals) => {
        const exploatatie = parseFloat(vals.get("suprafata_exploatatie")?.replace(",", ".") || "");
        const contracte = parseFloat(vals.get("suprafata_contracte")?.replace(",", ".") || "");
        if (isNaN(exploatatie) || isNaN(contracte)) return null;
        const diff = Math.abs(exploatatie - contracte);
        if (diff > 0.5) {
          return {
            passed: false,
            message: `Suprafață exploatație (${exploatatie} ha) ≠ suprafață contracte (${contracte} ha), diferență: ${diff.toFixed(2)} ha`,
          };
        }
        return { passed: true, message: `Suprafețe consistente: ${exploatatie} ha` };
      },
    },
    {
      name: "Putere tractor vs. max permis",
      keys: ["putere_tractor_propus", "putere_max_permisa"],
      validate: (vals) => {
        const propus = parseFloat(vals.get("putere_tractor_propus")?.replace(",", ".") || "");
        const max = parseFloat(vals.get("putere_max_permisa")?.replace(",", ".") || "");
        if (isNaN(propus) || isNaN(max)) return null;
        if (propus > max) {
          return {
            passed: false,
            message: `Putere tractor propus (${propus} CP) depășește maximul permis (${max} CP)`,
          };
        }
        return { passed: true, message: `Putere tractor OK: ${propus} CP ≤ ${max} CP` };
      },
    },
    {
      name: "Putere cumulată (existente + propus)",
      keys: ["putere_tractor_propus", "putere_tractoare_existente", "putere_max_cumulata"],
      validate: (vals) => {
        const propus = parseFloat(vals.get("putere_tractor_propus")?.replace(",", ".") || "");
        const existente = parseFloat(vals.get("putere_tractoare_existente")?.replace(",", ".") || "0");
        const maxCum = parseFloat(vals.get("putere_max_cumulata")?.replace(",", ".") || "");
        if (isNaN(propus) || isNaN(maxCum)) return null;
        const cumul = propus + existente;
        if (cumul > maxCum) {
          return {
            passed: false,
            message: `Putere cumulată (${cumul} CP = ${propus} propus + ${existente} existente) depășește maximul (${maxCum} CP)`,
          };
        }
        return { passed: true, message: `Putere cumulată OK: ${cumul} CP ≤ ${maxCum} CP` };
      },
    },
    {
      name: "Profit mediu vs. valoare sprijin",
      keys: ["profit_mediu_3ani", "valoare_sprijin"],
      validate: (vals) => {
        const profit = parseFloat(vals.get("profit_mediu_3ani")?.replace(",", ".") || "");
        const sprijin = parseFloat(vals.get("valoare_sprijin")?.replace(",", ".") || "");
        if (isNaN(profit) || isNaN(sprijin) || sprijin === 0) return null;
        if (profit > 4 * sprijin) {
          return {
            passed: false,
            message: `Profit mediu 3 ani (${profit}) > 4× valoare sprijin (${4 * sprijin})`,
          };
        }
        return { passed: true, message: `Profit/sprijin OK: ${profit} ≤ ${4 * sprijin}` };
      },
    },
    {
      name: "Cofinanțare minimă",
      keys: ["cofinantare_pct", "cofinantare_minima_pct"],
      validate: (vals) => {
        const cofin = parseFloat(vals.get("cofinantare_pct")?.replace(",", ".") || "");
        const minim = parseFloat(vals.get("cofinantare_minima_pct")?.replace(",", ".") || "");
        if (isNaN(cofin) || isNaN(minim)) return null;
        if (cofin < minim) {
          return {
            passed: false,
            message: `Cofinanțare (${cofin}%) sub minimul necesar (${minim}%)`,
          };
        }
        return { passed: true, message: `Cofinanțare OK: ${cofin}% ≥ ${minim}%` };
      },
    },
  ];

  // Only run cross-checks that involve the current element's key
  for (const rule of crossRules) {
    if (!rule.keys.includes(currentElementKey)) continue;

    const vals = new Map<string, string | null>();
    let hasAnyValue = false;
    for (const key of rule.keys) {
      if (key === currentElementKey) {
        vals.set(key, currentValue);
        hasAnyValue = true;
      } else {
        const el = elementMap.get(key);
        if (el?.value) {
          vals.set(key, el.value);
          hasAnyValue = true;
        }
      }
    }

    if (!hasAnyValue) continue;

    const result = rule.validate(vals);
    if (result) {
      results.push({ check: rule.name, ...result });
    }
  }

  return results;
}

// --- Rule-based Validation ---

async function validateAgainstRules(
  templateElementId: string,
  value: string,
  organizationId?: string,
): Promise<{ ruleResults: RuleResult[]; lookupResult?: LookupResult }> {
  const ruleResults: RuleResult[] = [];
  let lookupResult: LookupResult | undefined;

  // Get linked rules
  const elemLinks = await db.query.elementRuleLinks.findMany({
    where: eq(elementRuleLinks.templateElementId, templateElementId),
  });

  // FALLBACK: If no explicit links exist, try to match rules by condition.field
  let matchedRules: Array<{ rule: typeof rules.$inferSelect; fromLink: boolean }> = [];

  if (elemLinks.length > 0) {
    // Use explicit links
    for (const link of elemLinks) {
      const rule = await db.query.rules.findFirst({
        where: eq(rules.id, link.ruleId),
      });
      if (rule) matchedRules.push({ rule, fromLink: true });
    }
  } else if (organizationId) {
    // Fallback: find rules whose condition.field matches this element's key
    const templateEl = await db.query.templateElements.findFirst({
      where: eq(templateElements.id, templateElementId),
    });
    if (templateEl) {
      const orgRules = await db.query.rules.findMany({
        where: eq(rules.organizationId, organizationId),
      });
      const elementKey = templateEl.key.toLowerCase();
      const elementLabel = templateEl.label.toLowerCase();

      for (const rule of orgRules) {
        const condition = rule.condition as any;
        if (!condition?.field) continue;
        const fieldName = String(condition.field).toLowerCase();
        // Match if condition.field equals element key or is a close variant
        if (fieldName === elementKey ||
            elementKey.includes(fieldName) ||
            fieldName.includes(elementKey) ||
            elementLabel.includes(fieldName.replace(/_/g, " "))) {
          matchedRules.push({ rule, fromLink: false });
        }
      }
    }
  }

  for (const { rule, fromLink } of matchedRules) {
    // Check reference tables linked to this rule
    const refLinks = await db.query.ruleReferenceLinks.findMany({
      where: eq(ruleReferenceLinks.ruleId, rule.id),
    });

    if (refLinks.length === 0) {
      ruleResults.push({
        ruleId: rule.id,
        ruleText: rule.description,
        status: rule.type === "fixed" ? "info" : "warning",
        message: rule.type === "fixed"
          ? `Regulă fixă: ${rule.description}${!fromLink ? " (auto-match)" : ""}`
          : `Regulă interpretată — verificare manuală necesară${!fromLink ? " (auto-match)" : ""}`,
      });
      continue;
    }

    for (const refLink of refLinks) {
      const refTable = await db.query.guideReferenceTables.findFirst({
        where: eq(guideReferenceTables.id, refLink.referenceTableId),
      });
      if (!refTable) continue;

      const lookup = performLookup(value, {
        id: refTable.id,
        name: refTable.name,
        data: refTable.data as Array<Record<string, any>> | null,
        lookupKey: refTable.lookupKey,
        tableType: refTable.tableType,
      });

      // Keep the first successful lookup result, or the last one
      if (!lookupResult || lookup.matched) {
        lookupResult = lookup;
      }

      const status = refLink.usage === "validates"
        ? (lookup.matched ? "passed" : "failed")
        : (lookup.matched ? "passed" : "warning");

      ruleResults.push({
        ruleId: rule.id,
        ruleText: rule.description,
        status,
        message: lookup.message,
      });
    }
  }

  return { ruleResults, lookupResult };
}

// --- Main Validation Function ---

export async function validateElement(
  projectElementId: string,
  projectId: string,
): Promise<ValidationResult> {
  const element = await db.query.projectElements.findFirst({
    where: eq(projectElements.id, projectElementId),
  });
  if (!element) {
    return { status: "pending", details: {} };
  }

  if (!element.templateElementId) {
    return { status: "pending", details: {} };
  }

  const templateEl = await db.query.templateElements.findFirst({
    where: eq(templateElements.id, element.templateElementId),
  });
  if (!templateEl) {
    return { status: "pending", details: {} };
  }

  const value = element.value;

  // No value → pending
  if (!value || value.trim() === "") {
    return { status: "pending", details: {} };
  }

  // 1. Type validation
  const typeCheck = validateType(value, templateEl.fieldType);

  // 2. Rule + lookup validation
  const { ruleResults, lookupResult } = await validateAgainstRules(
    element.templateElementId,
    value,
    templateEl.organizationId,
  );

  // 3. Cross-element validation
  const crossChecks = await validateCrossElements(projectId, templateEl.key, value);

  // Determine overall status
  let status: "valid" | "warning" | "invalid" = "valid";

  if (!typeCheck.passed) {
    status = "invalid";
  }

  if (ruleResults.some(r => r.status === "failed")) {
    status = "invalid";
  } else if (ruleResults.some(r => r.status === "warning")) {
    if (status !== "invalid") status = "warning";
  }

  if (crossChecks.some(c => !c.passed)) {
    status = "invalid";
  }

  if (lookupResult && !lookupResult.matched) {
    if (status !== "invalid") status = "warning";
  }

  return {
    status,
    details: {
      typeCheck,
      lookupResult,
      crossChecks: crossChecks.length > 0 ? crossChecks : undefined,
      ruleResults: ruleResults.length > 0 ? ruleResults : undefined,
    },
  };
}

// --- Batch Validate All Elements of a Project ---

export async function validateAllProjectElements(projectId: string): Promise<{
  total: number;
  valid: number;
  warning: number;
  invalid: number;
  pending: number;
}> {
  const elements = await db.query.projectElements.findMany({
    where: eq(projectElements.projectId, projectId),
  });

  const stats = { total: elements.length, valid: 0, warning: 0, invalid: 0, pending: 0 };

  for (const el of elements) {
    const result = await validateElement(el.id, projectId);

    await db.update(projectElements).set({
      validationStatus: result.status,
      validationDetails: result.details,
    }).where(eq(projectElements.id, el.id));

    stats[result.status]++;
  }

  return stats;
}

// --- Audit Log ---

export async function logElementChange(params: {
  projectElementId: string;
  oldValue: string | null;
  newValue: string | null;
  oldValidationStatus?: "pending" | "valid" | "warning" | "invalid";
  newValidationStatus?: "pending" | "valid" | "warning" | "invalid";
  changedBy: string | null;
  changeSource: "onrc" | "solomon" | "manual" | "calculated" | "ghid" | "document_extracted" | "onrc_auto" | "anaf_auto" | "solomon_chat" | "consultant_manual" | "derived";
}): Promise<void> {
  await db.insert(elementAuditLog).values({
    projectElementId: params.projectElementId,
    oldValue: params.oldValue,
    newValue: params.newValue,
    oldValidationStatus: params.oldValidationStatus,
    newValidationStatus: params.newValidationStatus,
    changedBy: params.changedBy,
    changeSource: params.changeSource,
  });
}
