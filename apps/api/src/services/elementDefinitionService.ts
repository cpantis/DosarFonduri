import { db } from "../db";
import { elementDefinitions, templatePlaceholderMapping, templateElements } from "../db/schema";
import { eq, and, ilike } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { logAIUsage } from "./aiUsage";

const anthropic = new Anthropic();

// ─── TYPES ───

export interface ElementDefInput {
  guideDocumentId: string;
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
  helpText?: string;
  isDerived?: boolean;
  derivationFormula?: string;
  collectionOrder?: number;
}

// ─── CRUD ───

export async function upsertElementDefinition(input: ElementDefInput) {
  const existing = await db.query.elementDefinitions.findFirst({
    where: and(
      eq(elementDefinitions.elementKey, input.elementKey),
      eq(elementDefinitions.guideDocumentId, input.guideDocumentId),
    ),
  });

  if (existing) {
    const [updated] = await db.update(elementDefinitions).set({
      displayName: input.displayName,
      category: input.category ?? existing.category,
      dataType: input.dataType ?? existing.dataType,
      unit: input.unit ?? existing.unit,
      enumValues: input.enumValues ?? existing.enumValues,
      sourcePriority: input.sourcePriority ?? existing.sourcePriority,
      validationRules: input.validationRules ?? existing.validationRules,
      required: input.required ?? existing.required,
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
  if (defs.length === 0 || tmplElements.length === 0) return 0;

  let mapped = 0;

  for (const te of tmplElements) {
    const match = await findElementDefinition(te.key, organizationId, 0.7);
    if (!match) continue;

    try {
      await db.insert(templatePlaceholderMapping).values({
        templateDocumentId,
        placeholderKey: te.key,
        elementDefId: match.id,
        mappedBy: "auto",
        confidence: String(match.score) as any,
      }).onConflictDoNothing();
      mapped++;
    } catch {
      // ignore duplicates
    }
  }

  return mapped;
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
  "collection_order": number (ordinea logică de colectare)
}

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
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: ELEMENT_EXTRACTION_SYSTEM,
    messages: [{
      role: "user",
      content: `${ELEMENT_EXTRACTION_USER}${guideText.slice(0, 50000)}`,
    }],
  });

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
        helpText: el.help_text || undefined,
        isDerived: !!el.is_derived,
        derivationFormula: el.derivation_formula || undefined,
        collectionOrder: el.collection_order ?? i,
      });
      created++;
    } catch (err) {
      console.warn(`[elementDefinitionService] Failed to upsert element "${el.element_key}":`, err);
    }
  }

  console.log(`[elementDefinitionService] Extracted ${created} element definitions from guide ${guideDocumentId}`);
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
