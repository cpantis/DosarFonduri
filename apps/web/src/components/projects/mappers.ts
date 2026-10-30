/** Mappers from API payloads to the view models used by the project view and its tabs. */
import type { EligibilityRule, GuideRule, ElementItem, ChecklistItem } from "./types";

export function mapEligibilityRules(flat: any[]): EligibilityRule[] {
  return flat.map(item => {
    const conf = parseFloat(item.rule?.confidence) || item.confidence;
    const notes = item.notes || item.detail || "";
    return {
      id: item.id,
      ruleId: item.ruleId || item.rule?.id,
      name: item.rule?.description || "Regulă necunoscută",
      status: item.status === "passed" ? "pass" : item.status === "failed" ? "fail" : "pending",
      detail: notes,
      type: item.rule?.type || "fixed",
      confidence: conf,
      page: item.rule?.sourcePage ?? item.rule?.page,
      section: item.rule?.section,
      category: item.rule?.category || "",
      condition: item.rule?.condition || null,
      needsReview: item.rule?.needsReview ?? (conf != null && conf < 0.85),
      sourceDocument: item.rule?.sourceDocument || null,
      isPreEligibility: typeof notes === "string" && notes.startsWith("[Pre-elig]"),
    };
  });
}

export function mapGuideRules(grouped: any[]): GuideRule[] {
  const rules: GuideRule[] = [];
  for (const group of grouped) {
    for (const item of group.rules || []) {
      const cond = item.rule?.condition || null;
      // Extract semantic_tags from condition JSONB (stored there by processGuide)
      const tags: string[] = Array.isArray(cond?.semantic_tags) ? cond.semantic_tags : [];
      rules.push({
        id: item.id,
        ruleId: item.ruleId || item.rule?.id || undefined,
        type: item.rule?.type || "fixed",
        text: item.rule?.description || "",
        confidence: parseFloat(item.rule?.confidence) || 0.5,
        page: item.rule?.sourcePage ?? item.rule?.page ?? 0,
        section: item.rule?.category || "",
        category: item.rule?.category || "",
        sourceText: item.rule?.sourceText || null,
        condition: cond,
        semanticTags: tags,
        validated: item.rule?.validated ?? false,
        needsReview: item.rule?.needsReview ?? (parseFloat(item.rule?.confidence) < 0.85),
        sourceDocument: item.rule?.sourceDocument || group.document || null,
        linkedElements: item.rule?.linkedElements || [],
      });
    }
  }
  return rules;
}

const SOURCE_MAP: Record<string, string> = {
  onrc: "ONRC",
  onrc_auto: "ONRC",
  anaf_auto: "ANAF",
  manual: "Manual",
  consultant_manual: "Manual",
  solomon: "Solomon",
  solomon_chat: "Solomon",
  document: "OCR",
  document_extracted: "OCR",
  calculated: "Sistem",
  derived: "Sistem",
  ghid: "Ghid",
};

export function mapElements(elements: any[]): ElementItem[] {
  return elements.map(el => {
    const confirmed = el.confirmed;
    const hasValue = !!el.value;
    // Detect conflict: validationStatus=invalid with validationDetails containing conflict info
    const isConflict = el.validationStatus === "invalid" && el.validationDetails?.conflict;
    let status: "confirmat" | "propus_ai" | "gol" | "conflict" = "gol";
    if (isConflict) status = "conflict";
    else if (confirmed) status = "confirmat";
    else if (hasValue) status = "propus_ai";

    // Resolve key/label: prefer elementDefinition (new anchor), fallback to templateElement
    const elemDef = el.elementDefinition;
    const tmplEl = el.templateElement;
    const key = elemDef?.elementKey || tmplEl?.key || el.elementDefId || el.templateElementId || el.id;
    const label = elemDef?.displayName || tmplEl?.label || key;

    // Format value for display: JSON objects/arrays should be shown readable
    let displayValue = el.value;
    if (displayValue && typeof displayValue === "string") {
      try {
        const parsed = JSON.parse(displayValue);
        if (Array.isArray(parsed)) {
          displayValue = parsed.map((item: any) =>
            typeof item === "object" ? Object.values(item).filter(Boolean).join(", ") : String(item)
          ).join("; ");
        } else if (typeof parsed === "object" && parsed !== null) {
          displayValue = Object.entries(parsed)
            .filter(([, v]) => v != null)
            .map(([k, v]) => `${k}: ${typeof v === "number" ? new Intl.NumberFormat("ro-RO").format(v) : v}`)
            .join(" · ");
        }
      } catch {
        // Not JSON — keep as is
      }
    }

    return {
      id: el.id,
      key,
      label,
      value: displayValue,
      status,
      confidence: confirmed ? 100 : hasValue ? 85 : 0,
      source: el.source,
      sourceLabel: SOURCE_MAP[el.source] || el.source || null,
      sourceDocName: el.sourceDocument?.name || null,
      templates: [],
      category: elemDef?.category || tmplEl?.category || "other",
      required: elemDef?.required ?? false,
      validationStatus: el.validationStatus || null,
      validationDetails: el.validationDetails || null,
    };
  });
}

export function mapChecklist(items: any[]): ChecklistItem[] {
  return items.map(item => ({
    id: item.id,
    name: item.name,
    category: item.category || "General",
    source: item.source || "manual",
    templateId: item.templateId || null,
    templateName: item.templateName || null,
    done: item.done,
    notes: item.notes || null,
  }));
}
