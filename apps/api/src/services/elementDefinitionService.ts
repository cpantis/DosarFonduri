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

  // ═══ Phase 1: AI Sonnet semantic matching (primary — most robust) ═══
  // Send ALL template elements + ALL definitions to Sonnet for semantic mapping.
  // AI understands that nr_reg_com = numar_registru_comert, supraf_totala = suprafata_totala, etc.
  let aiUnmatched: Array<{ key: string; label: string }>;
  if (defs.length > 0) {
    const aiResult = await aiSemanticMapping(tmplElements, defs, templateDocumentId, organizationId);
    mapped += aiResult.matched;
    aiUnmatched = aiResult.unmatched;
  } else {
    aiUnmatched = tmplElements.map(te => ({ key: te.key, label: te.label }));
  }

  // ═══ Phase 2: Fuzzy text matching fallback (for elements AI missed or if AI failed) ═══
  // Uses already-loaded defs (no extra DB queries). Catches exact/normalized matches AI missed.
  const fuzzyUnmatched: typeof tmplElements = [];
  if (defs.length > 0 && aiUnmatched.length > 0) {
    // Build lookup structures once (not per-element)
    const exactMap = new Map(defs.map(d => [d.elementKey, d]));
    const normalizedMap = new Map(defs.map(d => [normalize(d.elementKey), d]));

    for (const te of aiUnmatched) {
      const normalizedInput = normalize(te.key);

      // 1. Exact match
      let match = exactMap.get(te.key);
      let matchScore = match ? 1.0 : 0;

      // 2. Normalized exact match
      if (!match) {
        match = normalizedMap.get(normalizedInput);
        matchScore = match ? 0.95 : 0;
      }

      // 3. Fuzzy match via similarity
      if (!match) {
        let bestScore = 0;
        for (const def of defs) {
          const score = similarity(normalizedInput, normalize(def.elementKey));
          if (score > bestScore) { bestScore = score; match = def; matchScore = score; }
        }
        // Fallback: display name similarity
        if (matchScore < 0.7) {
          for (const def of defs) {
            const score = similarity(normalizedInput, normalize(def.displayName)) * 0.85;
            if (score > matchScore) { matchScore = score; match = def; }
          }
        }
        if (matchScore < 0.7) match = undefined;
      }

      if (match) {
        try {
          await db.insert(templatePlaceholderMapping).values({
            templateDocumentId,
            placeholderKey: te.key,
            elementDefId: match.id,
            mappedBy: "auto",
            confidence: String(Number(matchScore) || 0.85),
          }).onConflictDoNothing();
          mapped++;
        } catch {
          // already mapped (conflict) — skip
        }
      } else {
        fuzzyUnmatched.push(te as any);
      }
    }
  } else {
    fuzzyUnmatched.push(...(aiUnmatched as any[]));
  }

  // ═══ Phase 3: Auto-create element_definitions for truly unmatched placeholders ═══
  // Neither AI nor fuzzy could find a match → create new definitions,
  // marked as unvalidated so consultants can review/correct in UI
  for (const te of fuzzyUnmatched) {
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

  console.log(`[elementDefService] autoMap complete: ${mapped} total mapped (AI phase 1, fuzzy phase 2, auto-create phase 3) for template ${templateDocumentId}`);
  return mapped;
}

/**
 * AI-powered semantic matching using Sonnet (Phase 1 — primary mapping strategy).
 * Sends all template placeholders and all element definitions to Sonnet
 * for robust semantic matching. Handles abbreviations, Romanian/English
 * equivalences, and domain-specific synonyms that fuzzy text matching misses.
 */
async function aiSemanticMapping(
  allElements: Array<{ key: string; label: string }>,
  defs: Array<{ id: string; elementKey: string; displayName: string }>,
  templateDocumentId: string,
  organizationId: string,
): Promise<{ matched: number; unmatched: Array<{ key: string; label: string }> }> {
  if (allElements.length === 0) return { matched: 0, unmatched: [] };

  const placeholderList = allElements.map(te => `  - "${te.key}" (label: "${te.label}")`).join("\n");
  const defsList = defs.map(d => `  - "${d.elementKey}" (${d.displayName})`).join("\n");

  try {
    const response = await withAILimit(() => anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: `Ești expert în maparea câmpurilor de formulare la definiții de elemente pentru fonduri europene din România.

SARCINĂ: Primești câmpuri placeholder din template-uri de documente și definiții canonice de elemente extrase din ghidul de finanțare. Mapează fiecare placeholder la definiția semantică echivalentă.

REGULI:
- Înțelege abrevieri: "nr_reg_com" = "numar_registru_comert", "supraf" = "suprafata", "val" = "valoare"
- Înțelege sinonime: "firma" = "societate" = "beneficiar", "adresa" = "sediu_social"
- Înțelege echivalențe RO/EN: "turnover" = "cifra_afaceri", "name" = "denumire"
- Înțelege context: "capital_social" din template = "capital_social_subscris" din ghid
- Mapează DOAR când ești sigur semantic (confidence > 0.6)
- Dacă un placeholder NU are echivalent clar, NU-L include în rezultat
- Fii generos cu mapările evidente dar conservator cu cele ambigue

Returnează DOAR un JSON array valid. Fără backticks, fără explicații.`,
      messages: [{
        role: "user",
        content: `Câmpuri placeholder din template:\n${placeholderList}\n\nDefiniții canonice (din ghid):\n${defsList}\n\nReturnează JSON array cu mapările:\n[{"placeholder_key": "cheie_exacta_din_template", "element_key": "cheie_exacta_din_definitii", "confidence": 0.0-1.0}]`,
      }],
    }));

    const text = response.content[0].type === "text" ? response.content[0].text : "[]";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    await logAIUsage({
      organizationId,
      agent: "template_mapping",
      model: "claude-sonnet-4-6",
      tokensInput: response.usage.input_tokens,
      tokensOutput: response.usage.output_tokens,
      action: "ai_semantic_mapping",
    });

    const mappings: Array<{ placeholder_key: string; element_key: string; confidence: number }> = JSON.parse(cleaned);
    if (!Array.isArray(mappings)) return { matched: 0, unmatched: allElements };

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
        // conflict = already mapped, skip
      }
    }

    const stillUnmatched = allElements.filter(te => !matchedKeys.has(te.key));
    console.log(`[elementDefService] Phase 1 AI: ${matched}/${allElements.length} mapped, ${stillUnmatched.length} remaining for fuzzy/auto-create`);
    return { matched, unmatched: stillUnmatched };
  } catch (err) {
    console.warn("[elementDefService] AI semantic mapping failed, all elements fall through to Phase 2 fuzzy:", err instanceof Error ? err.message : err);
    return { matched: 0, unmatched: allElements };
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

const ELEMENT_EXTRACTION_SYSTEM = `Ești consultant senior în fonduri europene. Extragi lista COMPLETĂ de elemente (câmpuri de date) necesare pentru dosarul de finanțare.

CUM GÂNDEȘTI:
- Ca un consultant care completează dosarul: ce date trebuie să am la îndemână ÎNAINTE de a începe scrierea?
- Fiecare regulă din ghid implică unul sau mai multe câmpuri — dacă regula zice "cifra de afaceri minim 100.000 EUR", atunci "cifra_afaceri" TREBUIE să fie element
- Unele câmpuri sunt IMPLICITE — ghidul nu le numește ca atare dar sunt necesare (ex: "firma trebuie să aibă sediul în zona eligibilă" implică elemente pentru județ, UAT, zonă urbană/rurală)
- Un element bun are: cheie unică, tip de date corect, unitate de măsură, indicație dacă e obligatoriu, text ajutător care explică CE se așteaptă
- Ordinea de colectare contează: mai întâi datele beneficiarului, apoi investiția, apoi financiarul

Categorii de elemente:
- beneficiary: date solicitant (CUI, denumire, forma juridică, CAEN, adresă, contact, reprezentant legal)
- farm: date exploatație/fermă (suprafață, cultură, animale, SO) — doar dacă programul e agricol
- investment: date investiție (valoare, descriere, echipamente, construcții, locuri de muncă)
- location: date locație (județ, UAT, coordonate, zonă urbană/rurală, mediu)
- financial: date financiare (cifra afaceri, profit, datorii, capitaluri, cofinanțare)
- legal: date juridice (act constitutiv, autorizații, avize, acorduri)
- technical: date tehnice (specificații, standarde, certificări, capacități)
- other: alte date

REGULI:
- Extrage TOATE elementele — inclusiv cele implicite din reguli și criterii de selecție
- snake_case pentru element_key (ex: cifra_afaceri_an_precedent)
- Tipuri: number, text, enum, boolean, date, document_ref, list_items
- Indică obligatoriu (required) — un câmp cerut de o regulă eliminatorie e OBLIGATORIU
- Unitate de măsură: ha, EUR, LEI, %, ani, luni, mp, tone, kW, etc.
- Enum: listează TOATE valorile posibile (ex: forma_juridica: ["SRL", "SA", "PFA", "II", "IF"])
- Formula derivare: pentru câmpuri calculate (ex: "numar_angajati_an1 - numar_angajati_an0")
- CARDINALITATE: min_count > 1 dacă ghidul cere multiple instanțe ("3 oferte" → min_count=3)
- help_text: scrie ce ar vedea consultantul ca tooltip — scurt, clar, cu referință la ghid dacă e cazul

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
    model: "claude-sonnet-4-6",
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
    model: "claude-sonnet-4-6",
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
