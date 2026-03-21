import { db } from "../db";
import { elementDefinitions, templatePlaceholderMapping, templateElements } from "../db/schema";
import { eq, and, ilike } from "drizzle-orm";
import { anthropic, withAILimit } from "../lib/anthropic";
import { logAIUsage } from "./aiUsage";
import { z } from "zod";

// W2.5: Zod schema for validationRules JSONB
const validationRulesSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  required: z.boolean().optional(),
  lookupTableId: z.string().optional(),
  lookupColumn: z.string().optional(),
  crossCheck: z.array(z.object({
    elementKey: z.string(),
    condition: z.string(),
  })).optional(),
}).passthrough();

// ─── TYPES ───

export interface ElementDefInput {
  guideDocumentId: string | null;
  organizationId: string;
  elementKey: string;
  displayName: string;
  category?: "beneficiary" | "farm" | "investment" | "location" | "financial" | "legal" | "technical" | "other";
  dataType?: "number" | "text" | "enum" | "boolean" | "date" | "document_ref" | "list_items";
  unit?: string;
  enumValues?: string[];
  sourcePriority?: string[];
  validationRules?: Record<string, any>;
  required?: boolean;
  minCount?: number;
  maxCount?: number | null;
  helpText?: string;
  isDerived?: boolean;
  derivationFormula?: string;
  collectionOrder?: number;
}

// ─── CRUD ───

export async function upsertElementDefinition(input: ElementDefInput) {
  // Find existing: first check org-level (prevents duplicates across guides),
  // then fall back to guide-specific match.
  // This ensures re-uploading a guide or uploading a new guide with the same
  // element keys reuses existing definitions instead of creating duplicates.
  let existing = await db.query.elementDefinitions.findFirst({
    where: and(
      eq(elementDefinitions.elementKey, input.elementKey),
      eq(elementDefinitions.organizationId, input.organizationId),
    ),
  });

  if (existing) {
    const [updated] = await db.update(elementDefinitions).set({
      // Update guideDocumentId if this definition came from a newer/different guide
      guideDocumentId: input.guideDocumentId ?? existing.guideDocumentId,
      displayName: input.displayName,
      category: input.category ?? existing.category,
      dataType: input.dataType ?? existing.dataType,
      unit: input.unit ?? existing.unit,
      enumValues: input.enumValues ?? existing.enumValues,
      sourcePriority: input.sourcePriority ?? existing.sourcePriority,
      validationRules: (() => {
        if (!input.validationRules || typeof input.validationRules !== "object") return existing.validationRules;
        const parsed = validationRulesSchema.safeParse(input.validationRules);
        return parsed.success ? parsed.data : existing.validationRules;
      })(),
      required: input.required ?? existing.required,
      minCount: input.minCount ?? existing.minCount,
      maxCount: input.maxCount !== undefined ? input.maxCount : existing.maxCount,
      helpText: input.helpText ?? existing.helpText,
      isDerived: input.isDerived ?? existing.isDerived,
      derivationFormula: input.derivationFormula ?? existing.derivationFormula,
      collectionOrder: input.collectionOrder ?? existing.collectionOrder,
    }).where(eq(elementDefinitions.id, existing.id)).returning();
    return updated;
  }

  const [created] = await db.insert(elementDefinitions).values({
    guideDocumentId: input.guideDocumentId,
    organizationId: input.organizationId,
    elementKey: input.elementKey,
    displayName: input.displayName,
    category: input.category ?? "other",
    dataType: input.dataType ?? "text",
    unit: input.unit,
    enumValues: input.enumValues,
    sourcePriority: input.sourcePriority ?? ["document_extracted", "solomon_chat", "consultant_manual"],
    validationRules: input.validationRules,
    required: input.required ?? false,
    minCount: input.minCount ?? 1,
    maxCount: input.maxCount ?? undefined,
    helpText: input.helpText,
    isDerived: input.isDerived ?? false,
    derivationFormula: input.derivationFormula,
    collectionOrder: input.collectionOrder ?? 0,
  }).returning();

  return created;
}

export async function getElementDefinitionsForGuide(guideDocumentId: string) {
  return db.query.elementDefinitions.findMany({
    where: eq(elementDefinitions.guideDocumentId, guideDocumentId),
    orderBy: elementDefinitions.collectionOrder,
  });
}

export async function getElementDefinitionsForOrg(organizationId: string) {
  return db.query.elementDefinitions.findMany({
    where: eq(elementDefinitions.organizationId, organizationId),
    orderBy: elementDefinitions.collectionOrder,
  });
}

// ─── VOCABULARY LIST (for extractors) ───

/**
 * Returns the list of valid element keys for a given organization.
 * Used to constrain extractors to known field names.
 */
export async function getExtractorVocabulary(organizationId: string): Promise<{
  keys: string[];
  keyToId: Map<string, string>;
  keyToDisplayName: Map<string, string>;
}> {
  const defs = await getElementDefinitionsForOrg(organizationId);

  const keys: string[] = [];
  const keyToId = new Map<string, string>();
  const keyToDisplayName = new Map<string, string>();

  for (const def of defs) {
    keys.push(def.elementKey);
    keyToId.set(def.elementKey, def.id);
    keyToDisplayName.set(def.elementKey, def.displayName);
  }

  return { keys, keyToId, keyToDisplayName };
}

// ─── FUZZY MATCHING ───

/**
 * Finds the best matching element_definition for a given extracted field key.
 * Uses exact match first, then normalized match, then fuzzy.
 * Returns null if no match above threshold.
 */
export async function findElementDefinition(
  fieldKey: string,
  organizationId: string,
  threshold = 0.6,
): Promise<{ id: string; elementKey: string; score: number } | null> {
  const defs = await getElementDefinitionsForOrg(organizationId);
  if (defs.length === 0) return null;

  const normalizedInput = normalize(fieldKey);

  // 1. Exact match
  for (const def of defs) {
    if (def.elementKey === fieldKey) {
      return { id: def.id, elementKey: def.elementKey, score: 1.0 };
    }
  }

  // 2. Normalized exact match
  for (const def of defs) {
    if (normalize(def.elementKey) === normalizedInput) {
      return { id: def.id, elementKey: def.elementKey, score: 0.95 };
    }
  }

  // 3. Fuzzy match via Levenshtein-like similarity
  let bestMatch: { id: string; elementKey: string; score: number } | null = null;

  for (const def of defs) {
    const score = similarity(normalizedInput, normalize(def.elementKey));
    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { id: def.id, elementKey: def.elementKey, score };
    }
  }

  // 4. Check display name similarity as fallback
  if (!bestMatch) {
    for (const def of defs) {
      const displayNorm = normalize(def.displayName);
      const score = similarity(normalizedInput, displayNorm) * 0.85; // penalty for display name match
      if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: def.id, elementKey: def.elementKey, score };
      }
    }
  }

  return bestMatch;
}

/**
 * Batch-resolve extracted field keys to element_definition IDs.
 * Returns a map of fieldKey → elementDefId.
 */
export async function resolveFieldKeys(
  fieldKeys: string[],
  organizationId: string,
  threshold = 0.6,
): Promise<Map<string, { id: string; elementKey: string; score: number }>> {
  const result = new Map<string, { id: string; elementKey: string; score: number }>();
  const defs = await getElementDefinitionsForOrg(organizationId);

  if (defs.length === 0) return result;

  // Build lookup structures once
  const exactMap = new Map<string, typeof defs[0]>();
  const normalizedMap = new Map<string, typeof defs[0]>();
  for (const def of defs) {
    exactMap.set(def.elementKey, def);
    normalizedMap.set(normalize(def.elementKey), def);
  }

  for (const fieldKey of fieldKeys) {
    // Exact match
    const exact = exactMap.get(fieldKey);
    if (exact) {
      result.set(fieldKey, { id: exact.id, elementKey: exact.elementKey, score: 1.0 });
      continue;
    }

    // Normalized match
    const norm = normalizedMap.get(normalize(fieldKey));
    if (norm) {
      result.set(fieldKey, { id: norm.id, elementKey: norm.elementKey, score: 0.95 });
      continue;
    }

    // Fuzzy match
    let bestScore = 0;
    let bestDef: typeof defs[0] | null = null;
    const normalizedInput = normalize(fieldKey);

    for (const def of defs) {
      const score = similarity(normalizedInput, normalize(def.elementKey));
      if (score > bestScore) {
        bestScore = score;
        bestDef = def;
      }
    }

    if (bestDef && bestScore >= threshold) {
      result.set(fieldKey, { id: bestDef.id, elementKey: bestDef.elementKey, score: bestScore });
    }
  }

  return result;
}

// ─── TEMPLATE PLACEHOLDER MAPPING ───

/**
 * Auto-map template placeholders to element_definitions.
 * Scans template_elements for a document and finds matching element_definitions.
 */
export async function autoMapTemplatePlaceholders(
  templateDocumentId: string,
  organizationId: string,
): Promise<number> {
  const tmplElements = await db.query.templateElements.findMany({
    where: eq(templateElements.documentId, templateDocumentId),
  });

  const defs = await getElementDefinitionsForOrg(organizationId);
  if (tmplElements.length === 0) return 0;

  let mapped = 0;
  const unmatchedElements: typeof tmplElements = [];

  // Phase 1: Fuzzy text matching (fast, no AI cost)
  for (const te of tmplElements) {
    const match = defs.length > 0
      ? await findElementDefinition(te.key, organizationId, 0.7)
      : null;

    if (match) {
      try {
        await db.insert(templatePlaceholderMapping).values({
          templateDocumentId,
          placeholderKey: te.key,
          elementDefId: match.id,
          mappedBy: "auto",
          confidence: String(Number(match.score) || 0.85),
        }).onConflictDoNothing();
        mapped++;
      } catch {
        // ignore duplicates
      }
    } else {
      unmatchedElements.push(te);
    }
  }

  // Phase 2: AI semantic matching for unmatched placeholders (Sonnet)
  if (unmatchedElements.length > 0 && defs.length > 0) {
    const aiMapped = await aiSemanticMapping(unmatchedElements, defs, templateDocumentId, organizationId);
    mapped += aiMapped.matched;
    // Elements still unmatched after AI are collected for Phase 3
    const stillUnmatched = aiMapped.unmatched;

    // Phase 3: Auto-create element_definitions for truly unmatched placeholders
    // These are marked needsReview so consultants can validate in UI
    for (const te of stillUnmatched) {
      try {
        const newDef = await upsertElementDefinition({
          guideDocumentId: null,
          organizationId,
          elementKey: sanitizeKey(te.key),
          displayName: te.label || te.key.replace(/_/g, " "),
          category: "other",
          dataType: inferDataType(te.key, (te as any).fieldType),
          required: false,
        });
        await db.insert(templatePlaceholderMapping).values({
          templateDocumentId,
          placeholderKey: te.key,
          elementDefId: newDef.id,
          mappedBy: "auto",
          confidence: "0.50",
          validated: false,
        }).onConflictDoNothing();
        mapped++;
      } catch {
        // ignore errors for auto-created defs
      }
    }
  } else if (unmatchedElements.length > 0 && defs.length === 0) {
    // No existing definitions at all — auto-create for each placeholder
    for (const te of unmatchedElements) {
      try {
        const newDef = await upsertElementDefinition({
          guideDocumentId: null,
          organizationId,
          elementKey: sanitizeKey(te.key),
          displayName: te.label || te.key.replace(/_/g, " "),
          category: "other",
          dataType: inferDataType(te.key, (te as any).fieldType),
          required: false,
        });
        await db.insert(templatePlaceholderMapping).values({
          templateDocumentId,
          placeholderKey: te.key,
          elementDefId: newDef.id,
          mappedBy: "auto",
          confidence: "0.50",
          validated: false,
        }).onConflictDoNothing();
        mapped++;
      } catch {
        // ignore
      }
    }
  }

  return mapped;
}

/**
 * AI-powered semantic matching using Sonnet.
 * Takes unmatched template elements and existing element definitions,
 * asks AI to find semantic equivalences.
 */
async function aiSemanticMapping(
  unmatched: Array<{ key: string; label: string }>,
  defs: Array<{ id: string; elementKey: string; displayName: string }>,
  templateDocumentId: string,
  organizationId: string,
): Promise<{ matched: number; unmatched: Array<{ key: string; label: string }> }> {
  if (unmatched.length === 0) return { matched: 0, unmatched: [] };

  const unmatchedList = unmatched.map(te => `  - "${te.key}" (label: "${te.label}")`).join("\n");
  const defsList = defs.map(d => `  - "${d.elementKey}" (${d.displayName})`).join("\n");

  try {
    const response = await withAILimit(() => anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: `Ești expert în maparea câmpurilor de formulare la definiții de elemente pentru fonduri europene.
Primești câmpuri nemapate din template-uri și definiții existente.
Returnează DOAR un JSON array cu mapările găsite. Fără explicații.
Dacă un câmp nu are echivalent semantic clar, NU-L include.
Threshold: mapează doar dacă ești sigur >60% că sunt echivalente semantic.`,
      messages: [{
        role: "user",
        content: `Câmpuri nemapate din template:\n${unmatchedList}\n\nDefiniții existente:\n${defsList}\n\nReturnează JSON array:\n[{"placeholder_key": "...", "element_key": "...", "confidence": 0.0-1.0}]`,
      }],
    }));

    const text = response.content[0].type === "text" ? response.content[0].text : "[]";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    await logAIUsage({
      organizationId,
      agent: "template_mapping",
      model: "claude-sonnet-4-20250514",
      tokensInput: response.usage.input_tokens,
      tokensOutput: response.usage.output_tokens,
      action: "ai_semantic_mapping",
    });

    const mappings: Array<{ placeholder_key: string; element_key: string; confidence: number }> = JSON.parse(cleaned);
    if (!Array.isArray(mappings)) return { matched: 0, unmatched };

    const defMap = new Map(defs.map(d => [d.elementKey, d.id]));
    let matched = 0;
    const matchedKeys = new Set<string>();

    for (const m of mappings) {
      if (!m.placeholder_key || !m.element_key || (m.confidence ?? 0) < 0.6) continue;
      const defId = defMap.get(m.element_key);
      if (!defId) continue;

      try {
        await db.insert(templatePlaceholderMapping).values({
          templateDocumentId,
          placeholderKey: m.placeholder_key,
          elementDefId: defId,
          mappedBy: "ai",
          confidence: String(m.confidence),
          validated: false,
        }).onConflictDoNothing();
        matched++;
        matchedKeys.add(m.placeholder_key);
      } catch {
        // ignore
      }
    }

    const stillUnmatched = unmatched.filter(te => !matchedKeys.has(te.key));
    console.log(`[elementDefService] AI semantic mapping: ${matched} matched, ${stillUnmatched.length} still unmatched`);
    return { matched, unmatched: stillUnmatched };
  } catch (err) {
    console.warn("[elementDefService] AI semantic mapping failed, falling back:", err instanceof Error ? err.message : err);
    return { matched: 0, unmatched };
  }
}

/**
 * Infer a reasonable data type from a placeholder key and field type.
 */
function inferDataType(key: string, fieldType?: string): "number" | "text" | "enum" | "boolean" | "date" | "document_ref" | "list_items" {
  const k = key.toLowerCase();
  if (fieldType === "number" || /valoare|suma|total|pret|cost|cantitate|suprafata|numar|nr_|procent|rata/i.test(k)) return "number";
  if (fieldType === "date" || /data_|date_|termen|deadline|an_|luna_/i.test(k)) return "date";
  if (fieldType === "checkbox" || /da_nu|este_|are_|accepta/i.test(k)) return "boolean";
  if (/document|atestat|certificat|acord|aviz|autorizat/i.test(k)) return "document_ref";
  return "text";
}

// ─── AI-POWERED ELEMENT EXTRACTION FROM GUIDE ───

const ELEMENT_EXTRACTION_SYSTEM = `Ești expert în fonduri europene și programe de finanțare din România.

Analizezi ghiduri de finanțare și extragi LISTA COMPLETĂ de elemente (câmpuri de date) pe care un consultant trebuie să le colecteze pentru a completa dosarul de finanțare.

Elementele sunt de tipurile:
- beneficiary: date despre solicitant (CUI, denumire, forma juridică, CAEN, adresă, contact)
- farm: date despre exploatație/fermă (suprafață, cultură, animale, SO)
- investment: date despre investiție (valoare, descriere, echipamente, construcții)
- location: date despre locație (județ, UAT, coordonate, zonă urbană/rurală)
- financial: date financiare (cifra afaceri, profit, datorii, capitaluri)
- legal: date juridice (act constitutiv, autorizații, avize)
- technical: date tehnice (specificații, standarde, certificări)
- other: alte date

IMPORTANT:
- Extrage TOATE elementele menționate în ghid, inclusiv cele implicite
- Folosește snake_case pentru element_key (ex: cifra_afaceri_an_precedent)
- Indică tipul de date (number, text, enum, boolean, date, document_ref, list_items)
- Indică dacă elementul este obligatoriu (required)
- Indică unitatea de măsură unde e cazul (ha, EUR, LEI, %, ani, luni)
- Indică valorile posibile pentru enum-uri
- Indică formula de derivare pentru câmpuri calculate
- CARDINALITATE: dacă ghidul cere mai multe instanțe (ex: "3 oferte de preț" → min_count=3, "minimum 2 surse" → min_count=2). Default min_count=1, max_count=null.

Returnează DOAR un JSON valid. Fără backticks, fără explicații.`;

const ELEMENT_EXTRACTION_USER = `Extrage lista completă de elemente (câmpuri de date) necesare din acest ghid de finanțare.

Pentru fiecare element returnează:
{
  "element_key": "snake_case_key",
  "display_name": "Numele vizibil al câmpului",
  "category": "beneficiary|farm|investment|location|financial|legal|technical|other",
  "data_type": "number|text|enum|boolean|date|document_ref|list_items",
  "unit": "unitate de măsură sau null",
  "enum_values": ["val1", "val2"] sau null,
  "required": true/false,
  "help_text": "text ajutător scurt",
  "is_derived": true/false,
  "derivation_formula": "formula sau null",
  "source_priority": ["document_extracted", "solomon_chat", "consultant_manual"],
  "collection_order": number (ordinea logică de colectare),
  "min_count": 1,
  "max_count": null
}

IMPORTANT CARDINALITATE: Dacă ghidul cere mai multe instanțe ale unui element, setează min_count > 1.
Exemple: "3 oferte de preț" → min_count=3, "minimum 2 surse" → min_count=2.
max_count = null înseamnă fără limită. Default: min_count=1, max_count=null.

TEXT GHID:
`;

/**
 * Use AI to extract element definitions from guide text.
 * Called during guide processing (Phase 5).
 */
export async function extractElementDefinitionsFromGuide(
  guideText: string,
  guideDocumentId: string,
  organizationId: string,
): Promise<number> {
  const response = await withAILimit(() => anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: ELEMENT_EXTRACTION_SYSTEM,
    messages: [{
      role: "user",
      content: `${ELEMENT_EXTRACTION_USER}${guideText.slice(0, 50000)}`,
    }],
  }));

  const content = response.content[0].type === "text" ? response.content[0].text : "[]";
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model: "claude-sonnet-4-20250514",
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: "extract_element_definitions",
  });

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) parsed = [];
  } catch {
    console.error("[elementDefinitionService] Failed to parse AI response for element definitions");
    return 0;
  }

  let created = 0;
  let failedCount = 0;
  const failedKeys: string[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const el = parsed[i];
    if (!el.element_key || !el.display_name) continue;

    try {
      await upsertElementDefinition({
        guideDocumentId,
        organizationId,
        elementKey: sanitizeKey(el.element_key),
        displayName: el.display_name,
        category: el.category || "other",
        dataType: el.data_type || "text",
        unit: el.unit || undefined,
        enumValues: Array.isArray(el.enum_values) ? el.enum_values : undefined,
        sourcePriority: Array.isArray(el.source_priority) ? el.source_priority : undefined,
        required: !!el.required,
        minCount: typeof el.min_count === "number" ? el.min_count : 1,
        maxCount: typeof el.max_count === "number" ? el.max_count : null,
        helpText: el.help_text || undefined,
        isDerived: !!el.is_derived,
        derivationFormula: el.derivation_formula || undefined,
        collectionOrder: el.collection_order ?? i,
      });
      created++;
    } catch (err) {
      failedCount++;
      const errMsg = err instanceof Error ? err.message : String(err);
      failedKeys.push(el.element_key);
      console.error(`[elementDefinitionService] Failed to upsert element "${el.element_key}":`, errMsg);
    }
  }

  if (failedCount > 0) {
    console.error(`[elementDefinitionService] ${failedCount}/${parsed.length} element definitions failed to upsert: ${failedKeys.join(", ")}`);
  }
  console.log(`[elementDefinitionService] Extracted ${created} element definitions from guide ${guideDocumentId} (${failedCount} failed)`);
  return created;
}

// ─── HELPERS ───

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-z0-9_]/gi, "_").toLowerCase().slice(0, 255);
}

/**
 * Simple bigram-based similarity score between two strings.
 * Returns 0.0–1.0.
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) {
    bigramsA.add(a.slice(i, i + 2));
  }

  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) {
    bigramsB.add(b.slice(i, i + 2));
  }

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}
