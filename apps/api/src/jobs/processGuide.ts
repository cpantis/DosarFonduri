import { Worker, Job } from "bullmq";
import { db } from "../db";
import { documents, rules, orgConfig, scoringCriteria, templateElements, elementRuleLinks, ruleReferenceLinks, guideReferenceTables, elementDefinitions } from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getFileBuffer } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX, preStructurePages, type PDFExtractionResult } from "../services/ocr";
import { logAIUsage } from "../services/aiUsage";
import { publishEvent, publishJobProgress } from "../lib/sse";
import { redis, isRedisReady } from "../lib/redis";
import { upsertElementDefinition, autoMapTemplatePlaceholders } from "../services/elementDefinitionService";
import { anthropic, withAILimit } from "../lib/anthropic";
import { repairTruncatedJSON } from "../lib/safeExtract";
import { preflightCached } from "../services/dbPreflight";
import { z } from "zod";
import { generateFieldListForPrompt, resolveFieldKey } from "@dosarfonduri/shared";
import { extractTables } from "./processReferenceData";
import { extractGuideV3 } from "./guideExtractorV3";

/** Generate a slugified rule_key from category + description */
function generateRuleKey(category: string, description: string): string {
  const slug = `${category}_${description.slice(0, 50)}`
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[ăâ]/gi, "a").replace(/[îì]/gi, "i")
    .replace(/[șş]/gi, "s").replace(/[țţ]/gi, "t")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return slug;
}

// W2.3: Zod schema for evaluationLogic JSONB validation
const evaluationLogicSchema = z.object({
  type: z.enum(["lookup", "range", "boolean", "formula"]),
  elementKey: z.string().optional(),
  referenceTableId: z.string().optional(),
  lookupColumn: z.string().optional(),
  ranges: z.array(z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    points: z.number(),
  })).optional(),
  formula: z.string().optional(),
}).passthrough();

// ─── COMPLETENESS VERIFICATION (Faza 3.5) ───

interface CompletenessReport {
  trustScore: number;
  categoriesFound: string[];
  categoriesMissing: string[];
  rulesNeedingReview: number;
  sectionsWithoutRules: string[];
  warnings: string[];
}

const REQUIRED_RULE_CATEGORIES = [
  // Fixed rule categories (from extraction prompt)
  "eligibilitate",
  "financiar",
  "tehnic",
  "administrativ",
  "achizitii",
  "documente",
  // Interpreted rule categories
  "selectie",
  "intensitate",
];

function verifyExtractionCompleteness(
  extractedRules: Array<{ category?: string; confidence?: number; sourceSection?: string }>,
  scoringResults: unknown[],
): CompletenessReport {
  // 1. Category coverage
  const categoriesFound = [...new Set(
    extractedRules.map(r => r.category).filter(Boolean) as string[],
  )];
  const categoriesMissing = REQUIRED_RULE_CATEGORIES.filter(
    cat => !categoriesFound.includes(cat),
  );

  // 2. Rules needing review (confidence < 0.85)
  const rulesNeedingReview = extractedRules.filter(
    r => (r.confidence ?? 0.5) < 0.85,
  ).length;

  // 3. Warnings
  const warnings: string[] = [];
  if (scoringResults.length === 0) {
    warnings.push("Zero criterii de selecție extrase");
  }
  if (categoriesMissing.length > 0) {
    warnings.push(`Categorii lipsă: ${categoriesMissing.join(", ")}`);
  }

  // 4. Trust score = weighted average
  const categoryScore = categoriesFound.length / REQUIRED_RULE_CATEGORIES.length;
  const confidenceScore = extractedRules.length > 0
    ? extractedRules.reduce((sum, r) => sum + (r.confidence ?? 0.5), 0) / extractedRules.length
    : 0;
  // Section coverage: approximate from category coverage (no section IDs available at this stage)
  const sectionScore = categoryScore; // correlates with category coverage

  const trustScore = Math.round(
    (categoryScore * 0.4 + confidenceScore * 0.3 + sectionScore * 0.3) * 100,
  ) / 100;

  return {
    trustScore,
    categoriesFound,
    categoriesMissing,
    rulesNeedingReview,
    sectionsWithoutRules: [], // not available at this extraction stage
    warnings,
  };
}

/** Sonnet 4.6 with adaptive thinking + effort control + prompt caching */
const DEFAULT_EXTRACTION_MODEL = "claude-sonnet-4-6";

/** Character limit for a single extraction pass — keep chunks moderate for faster output */
const EXTRACTION_CHAR_LIMIT = 80000;

/** Max concurrent extraction chunks */
const MAX_PARALLEL_CHUNKS = 3;

// ─── STEP 0: PAGE CLASSIFICATION ───

const PAGE_CLASSIFY_SYSTEM = `Clasifică fiecare pagină dintr-un ghid de finanțare în categorii. Returnează DOAR JSON valid.`;

const PAGE_CLASSIFY_USER = `Analizează rapid acest ghid de finanțare și clasifică fiecare pagină după conținut.

Categorii:
- "fixed": Condiții binare, praguri numerice, forme juridice, coduri CAEN, plafoane, liste eligibile/neeligibile, cheltuieli, TVA, deadline-uri
- "interpreted": Intensitate sprijin variabilă, decision trees, excepții, cazuri speciale, ajutor de stat, condiții cascadate, reguli cu "în funcție de"/"depinde de"
- "scoring": Grila de punctaj, criterii de selecție, tabele cu punctaje, evaluare tehnico-financiară
- "documents": Lista documentelor necesare, cerințe documentare, anexe obligatorii
- "info": Informații generale, descriere program, definiții, context (nu conțin reguli)

Returnează un JSON cu o singură cheie:
{
  "pages": {
    "1": "info",
    "2": "fixed",
    "3": "interpreted",
    ...
  }
}

Fii RAPID — nu analiza conținutul profund, doar scanează tiparul textului.

TEXT:
`;

interface PageClassification {
  fixed: number[];
  interpreted: number[];
  scoring: number[];
  documents: number[];
  info: number[];
}

async function classifyPages(
  structuredText: string,
  organizationId: string,
): Promise<PageClassification> {
  // Send only first ~200 chars per page for classification (much smaller than full text)
  const pageDelimiter = /--- Pagina (\d+) ---/g;
  const summaryParts: string[] = [];
  let m: RegExpExecArray | null;
  const pageStarts: Array<{ page: number; start: number }> = [];
  while ((m = pageDelimiter.exec(structuredText)) !== null) {
    pageStarts.push({ page: parseInt(m[1], 10), start: m.index });
  }
  for (let i = 0; i < pageStarts.length; i++) {
    const end = i + 1 < pageStarts.length ? pageStarts[i + 1].start : structuredText.length;
    const pageText = structuredText.slice(pageStarts[i].start, end);
    // Take first 200 chars of actual content (skip delimiter line)
    const contentStart = pageText.indexOf("\n") + 1;
    const preview = pageText.slice(contentStart, contentStart + 200).trim();
    summaryParts.push(`Pagina ${pageStarts[i].page}: ${preview}`);
  }
  const classificationInput = summaryParts.join("\n");

  const callStart = Date.now();
  const response: any = await withAILimit(() => (anthropic.messages.create as any)({
    model: DEFAULT_EXTRACTION_MODEL,
    max_tokens: 2000,
    system: PAGE_CLASSIFY_SYSTEM,
    messages: [{ role: "user", content: `${PAGE_CLASSIFY_USER}${classificationInput}` }],
  }));
  const callDuration = Date.now() - callStart;

  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model: DEFAULT_EXTRACTION_MODEL,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: "page_classification",
  });

  console.log(`[processGuide] Page classification: ${callDuration}ms in=${response.usage.input_tokens} out=${response.usage.output_tokens}`);

  const textBlock = response.content.find((b: any) => b.type === "text");
  const content = textBlock ? (textBlock as any).text : "{}";
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    const pages = parsed.pages || parsed;

    const result: PageClassification = { fixed: [], interpreted: [], scoring: [], documents: [], info: [] };
    for (const [pageStr, category] of Object.entries(pages)) {
      const pageNum = parseInt(pageStr, 10);
      if (isNaN(pageNum)) continue;
      const cat = String(category).toLowerCase();
      if (cat in result) {
        (result as any)[cat].push(pageNum);
      } else {
        result.fixed.push(pageNum); // default to fixed
      }
    }

    console.log(`[processGuide] Classification: fixed=${result.fixed.length} interpreted=${result.interpreted.length} scoring=${result.scoring.length} documents=${result.documents.length} info=${result.info.length}`);
    return result;
  } catch (e: any) {
    console.warn(`[processGuide] Classification parse failed, treating all pages as fixed:`, e.message);
    // Fallback: all pages as fixed
    const pageCount = (structuredText.match(/--- Pagina \d+/g) || []).length;
    return {
      fixed: Array.from({ length: pageCount }, (_, i) => i + 1),
      interpreted: [],
      scoring: [],
      documents: [],
      info: [],
    };
  }
}

/** Extract pages by number from the full structured text */
function extractPagesByNumbers(structuredText: string, pageNumbers: number[]): string {
  if (pageNumbers.length === 0) return "";
  const pageSet = new Set(pageNumbers);
  const pageDelimiter = /--- Pagina (\d+) ---/g;
  const pageStarts: Array<{ page: number; start: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pageDelimiter.exec(structuredText)) !== null) {
    pageStarts.push({ page: parseInt(match[1], 10), start: match.index });
  }

  const parts: string[] = [];
  for (let i = 0; i < pageStarts.length; i++) {
    if (pageSet.has(pageStarts[i].page)) {
      const end = i + 1 < pageStarts.length ? pageStarts[i + 1].start : structuredText.length;
      parts.push(structuredText.slice(pageStarts[i].start, end));
    }
  }
  return parts.join("\n");
}

// ─── CONSULTANT EXTRACTION PROMPT ───

// Generated at module load — contains the full field reference for the AI
const FIELD_LIST_FOR_PROMPT = generateFieldListForPrompt();

/** System prompt — consultant senior cu 15+ ani experiență, citește ghidul integral */
const CONSULTANT_SYSTEM = `Ești Solomon — consultant senior cu 15+ ani experiență în fonduri europene. Ai văzut sute de dosare respinse și știi EXACT ce contează.

CITEȘTI GHIDUL CA UN CONSULTANT CARE ÎȘI RISCĂ REPUTAȚIA:
- O regulă omisă = un dosar respins. O excepție nedetectată = o contestație pierdută.
- Regulile ELIMINATORII (eligibilitate) au prioritate absolută peste punctaj.
- Dacă ghidul lasă loc de interpretare, marchează explicit (needs_review + review_reason).
- Caută CONFLICTE între secțiuni — o secțiune poate contrazice alta.
- Excepțiile sunt adesea în ALT capitol decât regula de bază — citește TOTUL.

EXTRAGI SIMULTAN 5 categorii:

1. REGULI FIXE — condiții binare verificabile automat (DA/NU):
   Plafoane, forme juridice, CAEN-uri, vechime, zone, praguri achiziții, cheltuieli, TVA.
   Regulile ELIMINATORII → confidence ≥ 0.95. Referințe la anexe → menționează în source_text.

2. REGULI INTERPRETATE — condiții complexe cu arbori decizionali:
   Intensitate sprijin, excepții, cazuri speciale, ajutor de stat/de minimis, achiziții cascadate.
   TOATE ramurile decision tree documentate (nu doar cazul principal).
   needs_review=true dacă ambiguă + review_reason.

CLASIFICARE SEMANTICĂ per regulă: THRESHOLD, SCORING, TEMPORAL, DOCUMENT_BASED, DEPENDENCY, EXCLUSION, EXCEPTION, PROPORTIONAL, CLASSIFICATION. O regulă poate avea MULTIPLE etichete.

3. CRITERII DE SELECȚIE / GRILĂ DE PUNCTAJ:
   Cod, nume, punctaj maxim, categorie, logica evaluare (lookup/range/boolean/formula).
   Capturează structura COMPLETĂ a tabelelor de punctaj.

4. DEFINIȚII ELEMENTE — GÂNDEȘTE CA UN CONSULTANT CARE PREGĂTEȘTE DOSARUL:
   Parcurge FIECARE regulă și criteriu de selecție extras mai sus și întreabă-te:
   "Ce DATE îi trebuie consultantului pentru a verifica această regulă sau a calcula acest punctaj?"

   METODA DE EXTRAGERE (obligatorie, pas cu pas):
   a) Pentru FIECARE regulă fixă → ce câmp verifică? Creează elementul.
      Ex: "Forma juridică trebuie SRL/SA" → element: forma_juridica (enum)
      Ex: "Exploatația ≥ 8.000 SO" → element: dimensiune_economica_so (number, unit: EUR)
   b) Pentru FIECARE regulă interpretată → ce factori intră în arbore? Creează un element per factor.
      Ex: INT1 depinde de: categorie fermă, vârstă administrator, angajament agromediu, zonă ANC
      → 4 elemente separate: categorie_ferma_so, varsta_administrator, angajament_agromediu, zona_anc
   c) Pentru FIECARE criteriu de selecție → ce date sunt evaluate? Creează elementul.
      Ex: P2 "Membru formă asociativă = 10p" → element: membru_forma_asociativa (enum: da/nu)
      Ex: P3 "Utilaje no-till = 10p" → element: utilaje_no_till (enum: da/nu)
      Ex: P7 "Studii superioare agricol = 3p" → element: studii_manager_nivel (enum), studii_manager_domeniu (enum)
   d) Pentru FIECARE condiție din checklist documente → ce informație condiționează documentul?
      Ex: "Doar pentru forme asociative" → element: membru_forma_asociativa (dacă nu e deja creat)

   REGULA DE AUR: Dacă un consultant are nevoie de o informație pentru a completa cererea de finanțare
   sau pentru a evalua un criteriu de punctaj, acea informație TREBUIE să fie un element.
   NU te limita la lista de câmpuri predefinite — creează câmpuri noi specifice programului.
   Folosește snake_case descriptiv: membru_forma_asociativa, suprafata_sfecla_zahar, utilaje_no_till.

   CARDINALITATE: "3 oferte" → min_count=3. "Minimum 2 surse" → min_count=2.

5. DOCUMENTE NECESARE (checklist complet):
   TOATE documentele de depus — din secțiunea dedicată + mențiuni dispersate ("va prezenta", "va anexa").
   FIECARE document separat. Un document lipsă = dosar respins.
   Include CONDIȚIILE: "doar pentru forme asociative", "doar dacă valoare > 100.000 EUR", etc.

Fii EXHAUSTIV dar PRECIS — mai bine o regulă cu needs_review decât una omisă.
Returnează DOAR JSON valid. Fără backticks, fără explicații.`;

const CONSULTANT_USER = `Citește INTEGRAL acest ghid și extrage TOTUL — ca un consultant care pregătește dosarul de la zero.

CÂMPURI PREDEFINITE — folosește aceste chei canonice DACĂ se potrivesc:
${FIELD_LIST_FOR_PROMPT}

IMPORTANT: Lista de mai sus e doar un punct de plecare. Dacă ghidul menționează un concept care NU are cheie canonică,
CREEAZĂ o cheie nouă descriptivă în snake_case. Exemple:
- "Membru formă asociativă" → membru_forma_asociativa
- "Utilaje no-till" → utilaje_no_till
- "Suprafață sfeclă de zahăr" → suprafata_sfecla_zahar
- "Studii manager" → studii_manager_nivel + studii_manager_domeniu
- "Vechime agroalimentară" → vechime_agroalimentar_ani
NU omite un element doar pentru că nu e în lista predefinită. Ghidul e fundația — extrage TOT.

Returnează un singur obiect JSON cu 5 chei:
{
  "fixed_rules": [{ "category": "eligibilitate|financiar|tehnic|administrativ|achizitii|documente", "description": "...", "condition": { "field": "...", "operator": "eq|neq|gt|gte|lt|lte|in|not_in|between", "value": "...", "value2": "..." }, "semantic_tags": [...], "source_page": N, "source_text": "...", "confidence": 0.0-1.0 }],
  "interpreted_rules": [{ "category": "selectie|intensitate|eligibilitate_complexa|documentare|achizitii|ajutor_stat", "description": "...", "condition": { "type": "decision_tree|scoring|cumulative|conditional", "logic": "...", "factors": [...], "outcomes": [{"if":"...","then":"..."}] }, "semantic_tags": [...], "source_page": N, "source_text": "...", "confidence": 0.0-1.0, "needs_review": true/false, "review_reason": "..." }],
  "scoring_criteria": [{ "code": "...", "name": "...", "description": "...", "maxPoints": N, "category": "tehnic|financiar|management|relevant|sustenabilitate", "sourcePage": N, "evaluationLogic": { "type": "lookup|range|boolean|formula", "elementKey": "...", "ranges": [...], "formula": "..." } }],
  "element_definitions": [{ "element_key": "snake_case", "display_name": "...", "category": "beneficiary|farm|investment|location|financial|legal|technical|other", "data_type": "number|text|enum|boolean|date|document_ref|list_items", "unit": null, "enum_values": null, "required": true/false, "help_text": "...", "is_derived": false, "derivation_formula": null, "source_priority": ["document_extracted","solomon_chat","consultant_manual"], "collection_order": N, "min_count": 1, "max_count": null }],
  "document_requirements": [{ "name": "...", "category": "juridice|financiare|tehnice|declaratii|oferte|anexe|altele", "required": true, "description": "...", "format": "PDF|DOCX|XLSX|original|copie_conforma|orice", "source_page": null, "conditions": null }]
}

TEXT GHID:
`;

/**
 * Extract all rules + element definitions from a chunk of pre-structured guide text
 * using AI + Extended Thinking. Returns parsed results (not saved to DB).
 */
/** Max continuation attempts when output is truncated */
const MAX_CONTINUATION_ATTEMPTS = 2;

// repairTruncatedJSON imported from ../lib/safeExtract

async function unifiedExtraction(
  structuredText: string,
  organizationId: string,
  chunkLabel: string,
  useET: boolean,
): Promise<{
  fixedRules: any[];
  interpretedRules: any[];
  scoringCriteria: any[];
  elementDefinitions: any[];
  documentRequirements: any[];
  _meta: { truncated: boolean; continuations: number; totalInputTokens: number; totalOutputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
}> {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let accumulatedText = "";
  let continuations = 0;
  let wasTruncated = false;

  // Single consultant prompt — reads entire guide, extracts everything
  const cachedSystem: any[] = [
    { type: "text", text: CONSULTANT_SYSTEM, cache_control: { type: "ephemeral" } },
  ];

  const messages: Array<{ role: string; content: string }> = [{
    role: "user",
    content: `${CONSULTANT_USER}\n\n<guide_text>\n${structuredText}\n</guide_text>`,
  }];

  for (let attempt = 0; attempt <= MAX_CONTINUATION_ATTEMPTS; attempt++) {
    const requestParams: any = {
      model: DEFAULT_EXTRACTION_MODEL,
      max_tokens: 16000,
      system: cachedSystem,
      messages,
    };

    if (useET) {
      requestParams.temperature = 1;
      requestParams.thinking = { type: "enabled", budget_tokens: 10000 };
    }

    const callStart = Date.now();
    const response: any = await withAILimit(() => (anthropic.messages.create as any)(requestParams));
    const callDuration = Date.now() - callStart;

    const textBlock = response.content.find((b: any) => b.type === "text");
    const content = textBlock ? textBlock.text : "";
    accumulatedText += content;
    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    const cacheRead = response.usage.cache_read_input_tokens || 0;
    const cacheWrite = response.usage.cache_creation_input_tokens || 0;
    totalCacheRead += cacheRead;
    totalCacheWrite += cacheWrite;
    console.log(`[processGuide] ${chunkLabel} attempt=${attempt} ${callDuration}ms in=${response.usage.input_tokens} out=${response.usage.output_tokens} cache_r=${cacheRead} cache_w=${cacheWrite} stop=${response.stop_reason}`);

    await logAIUsage({
      organizationId,
      agent: "ghid_rules",
      model: DEFAULT_EXTRACTION_MODEL,
      tokensInput: response.usage.input_tokens,
      tokensOutput: response.usage.output_tokens,
      action: attempt === 0 ? `unified_extraction_${chunkLabel}` : `unified_extraction_${chunkLabel}_continuation_${attempt}`,
    });

    // Check if output was truncated
    if (response.stop_reason === "end_turn") {
      // Complete response
      break;
    }

    if (response.stop_reason === "max_tokens") {
      wasTruncated = true;
      continuations++;
      console.warn(`[processGuide] Output truncated for ${chunkLabel} (attempt ${attempt + 1}), requesting continuation...`);

      // Add assistant response + user continuation request
      messages.push({ role: "assistant", content: accumulatedText });
      messages.push({ role: "user", content: "JSON-ul a fost trunchiat. Continuă EXACT de unde ai rămas — returnează restul JSON-ului fără a repeta ce ai trimis deja. Începe direct cu textul care urmează." });
    } else {
      // Other stop reasons (stop_sequence, etc.) — treat as complete
      break;
    }
  }

  // Parse the accumulated JSON
  const cleaned = accumulatedText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const meta = { truncated: wasTruncated, continuations, totalInputTokens, totalOutputTokens, cacheReadTokens: totalCacheRead, cacheWriteTokens: totalCacheWrite };

  // Try direct parse first
  let parsed: any = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try JSON repair for truncated output
    parsed = repairTruncatedJSON(accumulatedText);
    if (parsed) {
      console.warn(`[processGuide] Repaired truncated JSON for ${chunkLabel} — some data may be incomplete`);
    } else {
      console.error(`[processGuide] CRITICAL: Failed to parse unified extraction JSON for ${chunkLabel}. Output length: ${accumulatedText.length} chars. First 200 chars: ${accumulatedText.slice(0, 200)}`);
      return { fixedRules: [], interpretedRules: [], scoringCriteria: [], elementDefinitions: [], documentRequirements: [], _meta: { ...meta, truncated: true } };
    }
  }

  const result = {
    fixedRules: Array.isArray(parsed.fixed_rules) ? parsed.fixed_rules : [],
    interpretedRules: Array.isArray(parsed.interpreted_rules) ? parsed.interpreted_rules : [],
    scoringCriteria: Array.isArray(parsed.scoring_criteria) ? parsed.scoring_criteria : [],
    elementDefinitions: Array.isArray(parsed.element_definitions) ? parsed.element_definitions : [],
    documentRequirements: Array.isArray(parsed.document_requirements) ? parsed.document_requirements : [],
    _meta: meta,
  };

  // Quality warning if extraction seems too sparse for the input size
  const inputChars = structuredText.length;
  const totalRules = result.fixedRules.length + result.interpretedRules.length;
  if (inputChars > 20000 && totalRules < 3) {
    console.warn(`[processGuide] QUALITY WARNING: ${chunkLabel} — ${inputChars} chars input but only ${totalRules} rules extracted. Possible extraction failure.`);
  }

  return result;
}

// ─── PASS 2: REFINE INTERPRETED RULES WITH ET ───

const REFINE_ET_SYSTEM = `Ești Solomon — consultant senior fonduri europene. Primești reguli interpretate extrase dintr-un ghid de finanțare.

MISIUNEA: Rafinează fiecare regulă cu raționament profund:
1. Identifică TOATE ramurile decision tree (nu doar cazul principal)
2. Detectează excepții, cazuri speciale, condiții cascadate
3. Verifică dacă description/source_text captează complet regula
4. Ajustează confidence bazat pe ambiguitate
5. Adaugă needs_review=true dacă regula e ambiguă sau incompletă
6. Completează review_reason cu explicație precisă

Returnează DOAR un array JSON cu regulile rafinate (aceeași structură, dar îmbunătățite).
Fără backticks, fără explicații, doar JSON valid.`;

/**
 * Pass 2: Refine interpreted rules using Extended Thinking.
 * Only processes rules that need deep reasoning — much faster than running ET on entire guide.
 * Typically 5-20 rules vs 60+ pages of text.
 */
async function refineInterpretedRulesWithET(
  interpretedRules: any[],
  organizationId: string,
): Promise<any[]> {
  if (interpretedRules.length === 0) return [];

  // Skip ET refinement if all rules already have high confidence (nothing to refine)
  const avgConfidence = interpretedRules.reduce((sum, r) => sum + (r.confidence || 0.5), 0) / interpretedRules.length;
  const lowConfidenceCount = interpretedRules.filter(r => (r.confidence || 0.5) < 0.85).length;
  if (lowConfidenceCount === 0 && avgConfidence >= 0.9) {
    console.log(`[processGuide] Skip ET refinement: all ${interpretedRules.length} rules have high confidence (avg=${avgConfidence.toFixed(2)})`);
    return interpretedRules;
  }

  // Serialize rules for AI (much smaller payload than full guide text)
  const rulesJson = JSON.stringify(interpretedRules, null, 2);

  // Skip ET refinement if rules payload is trivially small
  if (rulesJson.length < 200) return interpretedRules;

  // Use org config for model override, fallback to Opus
  const config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, organizationId),
  });
  const model = config?.reguliInterpModel || DEFAULT_EXTRACTION_MODEL;

  console.log(`[processGuide] ET refinement: ${interpretedRules.length} interpreted rules (${rulesJson.length} chars) with ${model}`);

  try {
    const response: any = await withAILimit(() => (anthropic.messages.create as any)({
      model,
      max_tokens: 12000,
      temperature: 1,
      thinking: { type: "enabled", budget_tokens: 8000 },
      system: REFINE_ET_SYSTEM,
      messages: [{
        role: "user",
        content: `Rafinează aceste ${interpretedRules.length} reguli interpretate cu raționament profund:\n\n${rulesJson}`,
      }],
    }));

    const textBlock = response.content.find((b: any) => b.type === "text");
    const content = textBlock ? (textBlock as any).text : "[]";

    await logAIUsage({
      organizationId,
      agent: "ghid_rules",
      model,
      tokensInput: response.usage.input_tokens,
      tokensOutput: response.usage.output_tokens,
      action: "et_refine_interpreted_rules",
    });

    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const refined = JSON.parse(cleaned);
    if (Array.isArray(refined) && refined.length > 0) {
      console.log(`[processGuide] ET refinement complete: ${refined.length} rules refined`);
      return refined;
    }
  } catch (e: any) {
    console.error(`[processGuide] ET refinement failed, using unrefined rules:`, e.message);
  }

  return interpretedRules; // Fallback to original rules if refinement fails
}

// ─── DEDUPLICATION ───

function deduplicateRules(allRules: any[]): any[] {
  const seen = new Map<string, any>();
  for (const rule of allRules) {
    const descNorm = (rule.description || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.,;:!?()"""'']/g, "")
      .trim();
    if (descNorm.length < 10) continue;

    // Use description + condition value for dedup key so rules with same text
    // but different thresholds are kept (e.g. "minim 1 an" vs "minim 3 ani")
    const condValue = rule.condition?.value != null ? String(rule.condition.value) : "";
    const condField = rule.condition?.field || "";
    const key = `${descNorm}|${condField}|${condValue}`;

    if (!seen.has(key)) {
      seen.set(key, rule);
    } else {
      // Keep the one with higher confidence
      const existing = seen.get(key);
      if ((rule.confidence || 0) > (existing.confidence || 0)) {
        seen.set(key, rule);
      }
    }
  }
  return Array.from(seen.values());
}

function deduplicateScoring(allCriteria: any[]): any[] {
  const seen = new Map<string, any>();
  for (const c of allCriteria) {
    const code = (c.code || "").toLowerCase().trim();
    if (!seen.has(code)) {
      seen.set(code, c);
    }
  }
  return Array.from(seen.values());
}

function deduplicateElementDefs(allDefs: any[]): any[] {
  const seen = new Map<string, any>();
  for (const def of allDefs) {
    const key = (def.element_key || "").toLowerCase().trim();
    if (key && !seen.has(key)) {
      seen.set(key, def);
    }
  }
  return Array.from(seen.values());
}

// ─── DB PERSISTENCE ───

async function saveFixedRules(fixedRules: any[], documentId: string, organizationId: string): Promise<number> {
  if (fixedRules.length === 0) return 0;
  await db.insert(rules).values(
    fixedRules.map((r: any) => {
      // Merge semantic_tags into the condition JSONB so it's available in the frontend
      const condition = r.condition ? { ...r.condition } : {};
      if (Array.isArray(r.semantic_tags) && r.semantic_tags.length > 0) {
        condition.semantic_tags = r.semantic_tags;
      }
      // Normalize field name to canonical key (e.g. "numar_angajati" → "angajati")
      if (condition.field) {
        condition.field = resolveFieldKey(condition.field);
      }
      return {
        documentId,
        organizationId,
        type: "fixed" as const,
        ruleKey: r.rule_key || r.ruleKey || generateRuleKey(r.category || "eligibilitate", r.description || ""),
        category: r.category || "eligibilitate",
        description: r.description,
        condition,
        sourcePage: r.source_page,
        sourceText: r.source_text,
        confidence: String(Number(r.confidence) || 0.90),
      };
    })
  );
  return fixedRules.length;
}

async function saveInterpretedRules(interpRules: any[], documentId: string, organizationId: string): Promise<number> {
  if (interpRules.length === 0) return 0;
  await db.insert(rules).values(
    interpRules.map((r: any) => {
      // Merge semantic_tags into the condition JSONB so it's available in the frontend
      const condition = r.condition ? { ...r.condition } : {};
      if (Array.isArray(r.semantic_tags) && r.semantic_tags.length > 0) {
        condition.semantic_tags = r.semantic_tags;
      }
      return {
        documentId,
        organizationId,
        type: "interpreted" as const,
        ruleKey: r.rule_key || r.ruleKey || generateRuleKey(r.category || "selectie", r.description || ""),
        category: r.category || "selectie",
        description: r.description,
        condition,
        sourcePage: r.source_page,
        sourceText: r.source_text,
        confidence: String(Number(r.confidence) || 0.75),
        needsReview: r.needs_review ?? (Number(r.confidence || 0.75) < 0.85),
        validated: false,
      };
    })
  );
  return interpRules.length;
}

async function saveScoringCriteria(criteria: any[], documentId: string, organizationId: string): Promise<number> {
  if (criteria.length === 0) return 0;

  await db.delete(scoringCriteria).where(eq(scoringCriteria.documentId, documentId));

  await db.insert(scoringCriteria).values(
    criteria.map((c: any, idx: number) => ({
      documentId,
      organizationId,
      code: c.code || `CS${idx + 1}`,
      name: c.name || "Criteriu neprecizat",
      description: c.description || null,
      maxPoints: String(Number(c.maxPoints) || 0),
      evaluationLogic: (() => {
        if (!c.evaluationLogic || typeof c.evaluationLogic !== "object") return null;
        const parsed = evaluationLogicSchema.safeParse(c.evaluationLogic);
        if (!parsed.success) {
          console.warn(`[processGuide] Invalid evaluationLogic for criterion "${c.code}":`, parsed.error.message);
          return null;
        }
        return parsed.data;
      })(),
      category: c.category || null,
      sortOrder: idx,
      sourcePage: c.sourcePage || null,
    }))
  );
  return criteria.length;
}

async function saveElementDefinitions(defs: any[], documentId: string, organizationId: string): Promise<number> {
  if (defs.length === 0) return 0;

  let created = 0;
  let failedCount = 0;
  const failedKeys: string[] = [];
  for (let i = 0; i < defs.length; i++) {
    const el = defs[i];
    if (!el.element_key || !el.display_name) continue;

    try {
      await upsertElementDefinition({
        guideDocumentId: documentId,
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
      failedKeys.push(el.element_key);
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[processGuide] Failed to upsert element "${el.element_key}":`, errMsg);
    }
  }
  if (failedCount > 0) {
    console.error(`[processGuide] ${failedCount}/${defs.length} element definitions failed to upsert: ${failedKeys.join(", ")}`);
    publishJobProgress(organizationId, {
      jobId: "", jobType: "ghid", documentId, documentName: "",
      progress: -1, status: "processing",
      message: `Atenție: ${failedCount} definiții de elemente nu au putut fi salvate din ${defs.length} total`,
    }).catch((e: any) => console.warn("[processGuide] sse element def upsert warning:", e.message));
  }
  return created;
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-z0-9_]/gi, "_").toLowerCase().slice(0, 255);
}

// ─── SMART MERGE (diff/merge for guide re-processing) ───

interface SmartMergeResult {
  fixedCount: number;
  interpCount: number;
  scoringCount: number;
  elemDefCount: number;
  added: number;
  updated: number;
  unchanged: number;
}

async function smartMergeGuideData(
  newFixed: any[],
  newInterpreted: any[],
  newScoring: any[],
  newElementDefs: any[],
  documentId: string,
  organizationId: string,
): Promise<SmartMergeResult> {
  let added = 0, updated = 0, unchanged = 0;

  // ── 1. SMART MERGE RULES ──
  // Load existing rules for this document
  const existingRules = await db.query.rules.findMany({
    where: and(eq(rules.documentId, documentId), eq(rules.organizationId, organizationId)),
  });

  // Build lookup map by ruleKey
  const existingByKey = new Map<string, typeof existingRules[number]>();
  for (const r of existingRules) {
    if (r.ruleKey) existingByKey.set(r.ruleKey, r);
  }

  // Process new fixed rules
  let fixedCount = 0;
  for (const r of newFixed) {
    const ruleKey = r.rule_key || r.ruleKey || generateRuleKey(r.category || "eligibilitate", r.description || "");
    const existing = existingByKey.get(ruleKey);
    const condition = r.condition ? { ...r.condition } : {};
    if (Array.isArray(r.semantic_tags) && r.semantic_tags.length > 0) {
      condition.semantic_tags = r.semantic_tags;
    }

    if (!existing) {
      // New rule — insert
      await db.insert(rules).values({
        documentId,
        organizationId,
        type: "fixed",
        ruleKey,
        category: r.category || "eligibilitate",
        description: r.description,
        condition,
        sourcePage: r.source_page,
        sourceText: r.source_text,
        confidence: String(Number(r.confidence) || 0.90),
      });
      added++;
      fixedCount++;
    } else if (!existing.validated) {
      // Existing but not validated — update with new extraction
      const newConfidence = Number(r.confidence) || 0.90;
      const existingConfidence = Number(existing.confidence) || 0;
      if (newConfidence >= existingConfidence || r.description !== existing.description) {
        await db.update(rules).set({
          description: r.description,
          condition,
          sourcePage: r.source_page,
          sourceText: r.source_text,
          confidence: String(newConfidence),
        }).where(eq(rules.id, existing.id));
        updated++;
      } else {
        unchanged++;
      }
      fixedCount++;
    } else {
      // Existing and validated — keep as-is
      unchanged++;
      fixedCount++;
    }
  }

  // Process new interpreted rules
  let interpCount = 0;
  for (const r of newInterpreted) {
    const ruleKey = r.rule_key || r.ruleKey || generateRuleKey(r.category || "selectie", r.description || "");
    const existing = existingByKey.get(ruleKey);
    const condition = r.condition ? { ...r.condition } : {};
    if (Array.isArray(r.semantic_tags) && r.semantic_tags.length > 0) {
      condition.semantic_tags = r.semantic_tags;
    }

    if (!existing) {
      await db.insert(rules).values({
        documentId,
        organizationId,
        type: "interpreted",
        ruleKey,
        category: r.category || "selectie",
        description: r.description,
        condition,
        sourcePage: r.source_page,
        sourceText: r.source_text,
        confidence: String(Number(r.confidence) || 0.75),
        needsReview: r.needs_review ?? (Number(r.confidence || 0.75) < 0.85),
        validated: false,
      });
      added++;
      interpCount++;
    } else if (!existing.validated) {
      const newConfidence = Number(r.confidence) || 0.75;
      const existingConfidence = Number(existing.confidence) || 0;
      if (newConfidence >= existingConfidence || r.description !== existing.description) {
        await db.update(rules).set({
          description: r.description,
          condition,
          sourcePage: r.source_page,
          sourceText: r.source_text,
          confidence: String(newConfidence),
          needsReview: r.needs_review ?? (newConfidence < 0.85),
        }).where(eq(rules.id, existing.id));
        updated++;
      } else {
        unchanged++;
      }
      interpCount++;
    } else {
      unchanged++;
      interpCount++;
    }
  }

  // ── 2. SMART MERGE SCORING CRITERIA ──
  const existingScoring = await db.query.scoringCriteria.findMany({
    where: and(eq(scoringCriteria.documentId, documentId), eq(scoringCriteria.organizationId, organizationId)),
  });
  const existingScoringByCode = new Map<string, typeof existingScoring[number]>();
  for (const s of existingScoring) {
    existingScoringByCode.set((s.code || "").toLowerCase(), s);
  }

  let scoringCount = 0;
  for (let idx = 0; idx < newScoring.length; idx++) {
    const c = newScoring[idx];
    const code = (c.code || `CS${idx + 1}`).toLowerCase();
    const existing = existingScoringByCode.get(code);

    const evaluationLogic = (() => {
      if (!c.evaluationLogic || typeof c.evaluationLogic !== "object") return null;
      const parsed = evaluationLogicSchema.safeParse(c.evaluationLogic);
      return parsed.success ? parsed.data : null;
    })();

    if (!existing) {
      await db.insert(scoringCriteria).values({
        documentId,
        organizationId,
        code: c.code || `CS${idx + 1}`,
        name: c.name || "Criteriu neprecizat",
        description: c.description || null,
        maxPoints: String(Number(c.maxPoints) || 0),
        evaluationLogic,
        category: c.category || null,
        sortOrder: idx,
        sourcePage: c.sourcePage || null,
      });
      added++;
      scoringCount++;
    } else {
      // Update if maxPoints or evaluation logic changed
      const existingMaxPts = Number(existing.maxPoints) || 0;
      const newMaxPts = Number(c.maxPoints) || 0;
      if (newMaxPts !== existingMaxPts || c.name !== existing.name || JSON.stringify(evaluationLogic) !== JSON.stringify(existing.evaluationLogic)) {
        await db.update(scoringCriteria).set({
          name: c.name || existing.name,
          description: c.description || existing.description,
          maxPoints: String(newMaxPts),
          evaluationLogic: evaluationLogic || existing.evaluationLogic,
          category: c.category || existing.category,
          sortOrder: idx,
        }).where(eq(scoringCriteria.id, existing.id));
        updated++;
      } else {
        unchanged++;
      }
      scoringCount++;
    }
  }

  // ── 3. ELEMENT DEFINITIONS — already uses upsert, just call as-is ──
  const elemDefCount = await saveElementDefinitions(newElementDefs, documentId, organizationId);
  // Element definitions upsert adds or updates, so count them all
  added += elemDefCount;

  return { fixedCount, interpCount, scoringCount, elemDefCount, added, updated, unchanged };
}

// ─── AUTO-LINKING ───

async function autoLinkRulesAndReferences(
  documentId: string,
  organizationId: string,
): Promise<{ elementLinks: number; referenceLinks: number }> {
  let elementLinksCreated = 0;
  let referenceLinksCreated = 0;

  const docRules = await db.query.rules.findMany({
    where: eq(rules.documentId, documentId),
  });

  const orgTemplateElements = await db.query.templateElements.findMany({
    where: eq(templateElements.organizationId, organizationId),
  });

  // FIX F2.2: Load elementDefinitions to populate elementDefId on links
  const orgElemDefs = await db.query.elementDefinitions.findMany({
    where: eq(elementDefinitions.organizationId, organizationId),
  });
  const elemDefByKey = new Map(orgElemDefs.map(ed => [ed.elementKey.toLowerCase(), ed]));

  const orgRefTables = await db.query.guideReferenceTables.findMany({
    where: eq(guideReferenceTables.organizationId, organizationId),
  });

  if (docRules.length === 0) {
    return { elementLinks: 0, referenceLinks: 0 };
  }

  // Build element key→id lookup (normalized)
  const elementsByKey = new Map<string, typeof orgTemplateElements[0]>();
  for (const el of orgTemplateElements) {
    elementsByKey.set(el.key.toLowerCase(), el);
    const labelKey = el.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (labelKey && !elementsByKey.has(labelKey)) {
      elementsByKey.set(labelKey, el);
    }
  }

  const fieldAliases: Record<string, string[]> = {
    "forma_juridica": ["forma_juridica", "tip_entitate", "forma_organizare", "tip_firma"],
    "cifra_afaceri": ["cifra_afaceri", "cifra_de_afaceri", "turnover", "venituri"],
    "angajati": ["angajati", "numar_angajati", "nr_angajati", "nr_salariati", "salariati"],
    "cod_caen": ["cod_caen", "caen", "cod_caen_principal", "caen_principal"],
    "vechime_ani": ["vechime_ani", "vechime", "ani_activitate", "data_infiintare"],
    "judet": ["judet", "judet_firma", "judet_sediu", "judet_implementare"],
    "capital_social": ["capital_social", "capital"],
    "suprafata": ["suprafata", "suprafata_ha", "suprafata_ferma", "suprafata_teren"],
  };

  const aliasToField = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(fieldAliases)) {
    for (const alias of aliases) {
      aliasToField.set(alias, canonical);
    }
  }

  const existingElemLinks = new Set<string>();
  const existingRefLinks = new Set<string>();

  for (const rule of docRules) {
    const condition = rule.condition as any;

    // --- ELEMENT LINKS ---
    if (condition?.field) {
      const fieldName = String(condition.field).toLowerCase();
      const fieldsToCheck = [fieldName];

      const canonical = aliasToField.get(fieldName);
      if (canonical) {
        const aliases = fieldAliases[canonical] || [];
        fieldsToCheck.push(...aliases);
      }

      let linkedViaTemplate = false;
      for (const f of fieldsToCheck) {
        const matchedElement = elementsByKey.get(f);
        if (matchedElement) {
          const linkKey = `${matchedElement.id}:${rule.id}`;
          if (!existingElemLinks.has(linkKey)) {
            existingElemLinks.add(linkKey);
            try {
              const matchedElemDef = elemDefByKey.get(matchedElement.key.toLowerCase());
              await db.insert(elementRuleLinks).values({
                templateElementId: matchedElement.id,
                elementDefId: matchedElemDef?.id || null,
                ruleId: rule.id,
                role: "constraint",
                description: `Auto-linked: rule condition.field "${condition.field}" → element "${matchedElement.key}"`,
              });
              elementLinksCreated++;
              linkedViaTemplate = true;
            } catch (err: any) {
              if (!err?.message?.includes("duplicate") && !err?.message?.includes("unique")) {
                console.warn(`[autoLink] Failed to create element-rule link:`, err?.message);
              }
            }
          } else {
            linkedViaTemplate = true;
          }
          break;
        }
      }

      // Fallback: link directly to element_definition if no template element matched
      if (!linkedViaTemplate) {
        for (const f of fieldsToCheck) {
          const matchedElemDef = elemDefByKey.get(f);
          if (matchedElemDef) {
            const linkKey = `elemdef:${matchedElemDef.id}:${rule.id}`;
            if (!existingElemLinks.has(linkKey)) {
              existingElemLinks.add(linkKey);
              try {
                await db.insert(elementRuleLinks).values({
                  templateElementId: null,
                  elementDefId: matchedElemDef.id,
                  ruleId: rule.id,
                  role: "constraint",
                  description: `Auto-linked: rule condition.field "${condition.field}" → elemDef "${matchedElemDef.elementKey}"`,
                });
                elementLinksCreated++;
              } catch (err: any) {
                if (!err?.message?.includes("duplicate") && !err?.message?.includes("unique")) {
                  console.warn(`[autoLink] Failed to create elemDef-rule link:`, err?.message);
                }
              }
            }
            break;
          }
        }
      }
    }

    if (condition?.type === "scoring" || condition?.elementKey) {
      const elementKey = (condition.elementKey || "").toLowerCase();
      if (elementKey) {
        let linkedScoring = false;
        const matchedElement = elementsByKey.get(elementKey);
        if (matchedElement) {
          const linkKey = `${matchedElement.id}:${rule.id}`;
          if (!existingElemLinks.has(linkKey)) {
            existingElemLinks.add(linkKey);
            try {
              const scoringElemDef = elemDefByKey.get(matchedElement.key.toLowerCase());
              await db.insert(elementRuleLinks).values({
                templateElementId: matchedElement.id,
                elementDefId: scoringElemDef?.id || null,
                ruleId: rule.id,
                role: "input",
                description: `Auto-linked: scoring elementKey "${condition.elementKey}" → element "${matchedElement.key}"`,
              });
              elementLinksCreated++;
              linkedScoring = true;
            } catch (err: any) {
              if (!err?.message?.includes("duplicate") && !err?.message?.includes("unique")) {
                console.warn(`[autoLink] Failed to create element-rule link:`, err?.message);
              }
            }
          } else {
            linkedScoring = true;
          }
        }
        // Fallback: link directly to element_definition
        if (!linkedScoring) {
          const matchedElemDef = elemDefByKey.get(elementKey);
          if (matchedElemDef) {
            const linkKey = `elemdef:${matchedElemDef.id}:${rule.id}`;
            if (!existingElemLinks.has(linkKey)) {
              existingElemLinks.add(linkKey);
              try {
                await db.insert(elementRuleLinks).values({
                  templateElementId: null,
                  elementDefId: matchedElemDef.id,
                  ruleId: rule.id,
                  role: "input",
                  description: `Auto-linked: scoring elementKey "${condition.elementKey}" → elemDef "${matchedElemDef.elementKey}"`,
                });
                elementLinksCreated++;
              } catch (err: any) {
                if (!err?.message?.includes("duplicate") && !err?.message?.includes("unique")) {
                  console.warn(`[autoLink] Failed to create scoring elemDef link:`, err?.message);
                }
              }
            }
          }
        }
      }
    }

    // --- REFERENCE TABLE LINKS ---
    const ruleText = `${rule.description || ""} ${rule.sourceText || ""}`.toLowerCase();

    for (const refTable of orgRefTables) {
      const tableName = (refTable.name || "").toLowerCase();
      if (!tableName || tableName.length < 5) continue;

      const tableNameWords = tableName.split(/[\s\-_,]+/).filter(w => w.length > 3);
      const matchScore = tableNameWords.filter(w => ruleText.includes(w)).length;

      if (ruleText.includes(tableName) || (tableNameWords.length >= 2 && matchScore >= 2)) {
        const linkKey = `${rule.id}:${refTable.id}`;
        if (!existingRefLinks.has(linkKey)) {
          existingRefLinks.add(linkKey);

          const usage = rule.type === "fixed" ? "validates" as const
            : rule.category === "selectie" ? "scores" as const
            : "classifies" as const;

          try {
            await db.insert(ruleReferenceLinks).values({
              ruleId: rule.id,
              referenceTableId: refTable.id,
              usage,
              description: `Auto-linked: rule mentions "${tableName}"`,
            });
            referenceLinksCreated++;
          } catch (err: any) {
            if (!err?.message?.includes("duplicate") && !err?.message?.includes("unique")) {
              console.warn(`[autoLink] Failed to create rule-reference link:`, err?.message);
            }
          }
        }
      }
    }
  }

  // Also link scoring criteria to reference tables
  const docScoring = await db.query.scoringCriteria.findMany({
    where: eq(scoringCriteria.documentId, documentId),
  });

  for (const sc of docScoring) {
    const evalLogic = sc.evaluationLogic as any;
    if (!evalLogic) continue;

    if (evalLogic.elementKey) {
      const elementKey = String(evalLogic.elementKey).toLowerCase();
      const matchingRule = docRules.find(r =>
        r.description?.includes(sc.code) || r.description?.includes(sc.name)
      );
      if (matchingRule) {
        let linkedSc = false;
        const matchedElement = elementsByKey.get(elementKey);
        if (matchedElement) {
          const linkKey = `${matchedElement.id}:${matchingRule.id}`;
          if (!existingElemLinks.has(linkKey)) {
            existingElemLinks.add(linkKey);
            try {
              const scElemDef = elemDefByKey.get(matchedElement.key.toLowerCase());
              await db.insert(elementRuleLinks).values({
                templateElementId: matchedElement.id,
                elementDefId: scElemDef?.id || null,
                ruleId: matchingRule.id,
                role: "input",
                description: `Auto-linked: scoring ${sc.code} elementKey "${evalLogic.elementKey}"`,
              });
              elementLinksCreated++;
              linkedSc = true;
            } catch (err: any) {
              if (!err?.message?.includes("duplicate") && !err?.message?.includes("unique")) {
                console.warn(`[autoLink] Failed to create scoring element link:`, err?.message);
              }
            }
          } else {
            linkedSc = true;
          }
        }
        // Fallback: link directly to element_definition
        if (!linkedSc) {
          const matchedElemDef = elemDefByKey.get(elementKey);
          if (matchedElemDef) {
            const linkKey = `elemdef:${matchedElemDef.id}:${matchingRule.id}`;
            if (!existingElemLinks.has(linkKey)) {
              existingElemLinks.add(linkKey);
              try {
                await db.insert(elementRuleLinks).values({
                  templateElementId: null,
                  elementDefId: matchedElemDef.id,
                  ruleId: matchingRule.id,
                  role: "input",
                  description: `Auto-linked: scoring ${sc.code} elementKey "${evalLogic.elementKey}" → elemDef "${matchedElemDef.elementKey}"`,
                });
                elementLinksCreated++;
              } catch (err: any) {
                if (!err?.message?.includes("duplicate") && !err?.message?.includes("unique")) {
                  console.warn(`[autoLink] Failed to create scoring elemDef link:`, err?.message);
                }
              }
            }
          }
        }
      }
    }

    if (evalLogic.type === "lookup" && evalLogic.lookupColumn) {
      for (const refTable of orgRefTables) {
        const schema = refTable.schema as Array<{ key: string; label: string }> | null;
        if (!schema) continue;
        const hasColumn = schema.some(col =>
          col.key === evalLogic.lookupColumn || col.label === evalLogic.lookupColumn
        );
        if (hasColumn) {
          const matchingRule = docRules.find(r =>
            r.description?.includes(sc.code) || r.description?.includes(sc.name)
          );
          if (matchingRule) {
            const linkKey = `${matchingRule.id}:${refTable.id}`;
            if (!existingRefLinks.has(linkKey)) {
              existingRefLinks.add(linkKey);
              try {
                await db.insert(ruleReferenceLinks).values({
                  ruleId: matchingRule.id,
                  referenceTableId: refTable.id,
                  usage: "scores",
                  description: `Auto-linked: scoring ${sc.code} lookup column "${evalLogic.lookupColumn}"`,
                });
                referenceLinksCreated++;
              } catch (err: any) {
                if (!err?.message?.includes("duplicate") && !err?.message?.includes("unique")) {
                  console.warn(`[autoLink] Failed to create scoring reference link:`, err?.message);
                }
              }
            }
          }
        }
      }
    }
  }

  console.log(`[autoLink] Created ${elementLinksCreated} element-rule links and ${referenceLinksCreated} rule-reference links for document ${documentId}`);
  return { elementLinks: elementLinksCreated, referenceLinks: referenceLinksCreated };
}

// ─── GUIDE TEXT CACHING ───

async function cacheGuideText(documentId: string, text: string): Promise<void> {
  if (!isRedisReady()) return;
  try {
    await redis.set(`guide_text:${documentId}`, text, "EX", 30 * 86400);
  } catch (err) {
    console.warn("Failed to cache guide text:", err);
  }
}

// ─── CHUNKING FOR LARGE GUIDES ───

/** Number of overlap pages between chunks to prevent losing rules at boundaries */
const CHUNK_OVERLAP_PAGES = 3;

/**
 * Split structured text into chunks that fit within the extraction model context.
 * Uses page delimiters for clean splits with overlap to prevent
 * losing rules that span chunk boundaries.
 */
function splitStructuredText(structuredText: string): string[] {
  if (structuredText.length <= EXTRACTION_CHAR_LIMIT) {
    return [structuredText];
  }

  const pageDelimiter = /--- Pagina \d+/g;
  const pageStarts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pageDelimiter.exec(structuredText)) !== null) {
    pageStarts.push(match.index);
  }

  if (pageStarts.length <= 1) return [structuredText];

  // Build chunks respecting char limit, with page overlap
  const chunks: string[] = [];
  let chunkStartPage = 0;

  while (chunkStartPage < pageStarts.length) {
    // Find how many pages fit in this chunk
    let chunkEndPage = chunkStartPage;
    for (let i = chunkStartPage + 1; i < pageStarts.length; i++) {
      const chunkSize = pageStarts[i] - pageStarts[chunkStartPage];
      if (chunkSize > EXTRACTION_CHAR_LIMIT) break;
      chunkEndPage = i;
    }

    // If we couldn't fit even one page, take it anyway
    if (chunkEndPage === chunkStartPage) chunkEndPage = chunkStartPage;

    const startIdx = pageStarts[chunkStartPage];
    const endIdx = chunkEndPage + 1 < pageStarts.length
      ? pageStarts[chunkEndPage + 1]
      : structuredText.length;

    chunks.push(structuredText.slice(startIdx, endIdx));

    // Move forward, leaving CHUNK_OVERLAP_PAGES overlap
    const nextStart = chunkEndPage + 1 - CHUNK_OVERLAP_PAGES;
    if (nextStart <= chunkStartPage) {
      // Prevent infinite loop if overlap is larger than chunk
      chunkStartPage = chunkEndPage + 1;
    } else {
      chunkStartPage = nextStart;
    }

    // If we've consumed all pages, stop
    if (chunkEndPage >= pageStarts.length - 1) break;
  }

  console.log(`[processGuide] Split ${pageStarts.length} pages into ${chunks.length} chunks with ${CHUNK_OVERLAP_PAGES}-page overlap`);
  return chunks;
}

// ─── MAIN WORKER ───

interface ProcessGuidePayload {
  documentId: string;
  organizationId: string;
  reprocessMode?: "full" | "smart";
}

export const processGuideWorker = new Worker<ProcessGuidePayload>(
  "process-guide",
  async (job: Job<ProcessGuidePayload>) => {
    const { documentId, organizationId, reprocessMode } = job.data;
    const isSmartMerge = reprocessMode === "smart";
    const startTime = Date.now();

    // ─── DB PREFLIGHT CHECK (before any AI calls) ───
    const check = await preflightCached(db, "processGuide");
    if (!check.ready) {
      console.error("[processGuide] Preflight FAILED", { operation: "processGuide", missing: check.missing });
      publishEvent(`org:${organizationId}:uploads`, "processing_error", {
        documentId,
        message: check.message,
      }).catch((e: any) => console.warn("[processGuide] sse preflight error:", e.message));
      throw new Error(`DB preflight failed: ${check.message}`);
    }

    try {
      await db.update(documents).set({ status: "processing", processingError: null }).where(eq(documents.id, documentId));

      const docResult = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
      if (!docResult) throw new Error("Document not found");
      const doc = docResult; // non-nullable for TS narrowing in closures

      const { buffer, name: fileName } = await getFileBuffer(doc.fileId);

      // ─── STEP 1: Text extraction (PyMuPDF, zero AI, < 1 second) ───
      const extractStart = Date.now();
      let rawText = "";
      let pdfResult: PDFExtractionResult | null = null;
      if (doc.fileType === "pdf") {
        pdfResult = await extractTextFromPDF(buffer);
        rawText = pdfResult.text;
      } else if (doc.fileType === "docx" || doc.fileType === "doc") {
        rawText = await extractTextFromDOCX(buffer, fileName);
      } else if (doc.fileType === "xlsx") {
        rawText = await extractTextFromXLSX(buffer, fileName);
      } else {
        throw new Error(`Format nesuportat pentru ghid: ${doc.fileType}`);
      }
      const extractDuration = Date.now() - extractStart;
      const totalChars = rawText.length;
      const totalPages = pdfResult?.totalPages || Math.ceil(totalChars / 3000);
      console.log(`[processGuide] Text extraction: ${extractDuration}ms for "${doc.name}"`);

      // Estimate processing time based on text size
      // ~80 tokens/sec Sonnet output, ~60% of max_tokens realistic output per chunk
      // Chunks: ceil(totalChars / 80000), each ~15K tokens input → ~10K output → ~125s
      // With ET: +10K thinking → ~250s per chunk
      // Parallel: min(chunks, 3) simultaneous
      const estChunks = Math.max(1, Math.ceil(totalChars / 80000));
      const estRounds = Math.ceil(estChunks / 3);
      const estSecondsPerChunk = totalChars > 50000 ? 180 : 90; // larger guides take longer per chunk
      const estTotalSeconds = estRounds * estSecondsPerChunk + 10; // +10s for DB save/link
      const estMinutes = Math.ceil(estTotalSeconds / 60);

      // Cache raw text in Redis for Solomon/Neemia
      cacheGuideText(documentId, rawText).catch((e: any) => console.warn("[processGuide] redis cache guide text:", e.message));

      await job.updateProgress(5);
      publishJobProgress(organizationId, {
        jobId: job.id || "",
        jobType: "ghid",
        documentId,
        documentName: doc.name,
        progress: 5,
        status: "processing",
        message: `Analizez ${totalPages} pagini — ghidul va fi gata in aproximativ ${estMinutes} ${estMinutes === 1 ? "minut" : "minute"}`,
      }).catch((e: any) => console.warn("[processGuide] sse estimate:", e.message));

      // ─── STEP 2: Pre-structuring — SKIP for native PDFs, use GPT-4o only for scanned ───
      const needsPreStructure = pdfResult?.hasScannedPages === true;
      let structuredText: string;
      let preStructDuration = 0;
      let preStructPageCount = 0;
      let preStructTableCount = 0;

      if (needsPreStructure) {
        publishJobProgress(organizationId, {
          jobId: job.id || "",
          jobType: "ghid",
          documentId,
          documentName: doc.name,
          progress: 5,
          status: "processing",
          message: `Text extras din "${doc.name}". Pre-structurare cu GPT-4o (${pdfResult!.scannedPageCount} pagini scanate)...`,
        }).catch((e: any) => console.warn("[processGuide] sse pre-structure progress:", e.message));

        const preStructStart = Date.now();
        const preStructured = await preStructurePages(rawText, organizationId);
        preStructDuration = Date.now() - preStructStart;
        preStructPageCount = preStructured.pageCount;
        preStructTableCount = preStructured.tableCount;
        structuredText = preStructured.structuredText;
        console.log(`[processGuide] GPT-4o pre-structuring: ${preStructDuration}ms for "${doc.name}" (${preStructPageCount} pages, ${preStructTableCount} tables)`);
      } else {
        // Native PDF — PyMuPDF text is good enough, skip GPT-4o entirely ($0 cost)
        structuredText = rawText;
        preStructPageCount = pdfResult?.totalPages || 1;
        console.log(`[processGuide] SKIP GPT-4o pre-structuring — PDF nativ, ${pdfResult?.totalPages || 0} pagini, ${pdfResult?.totalChars || rawText.length} chars (zero AI cost)`);
      }

      await job.updateProgress(30);
      publishJobProgress(organizationId, {
        jobId: job.id || "",
        jobType: "ghid",
        documentId,
        documentName: doc.name,
        progress: 30,
        status: "processing",
        message: `Extrag reguli, criterii de selectie si elemente necesare...`,
      }).catch((e: any) => console.warn("[processGuide] sse extraction start:", e.message));

      // ─── STEP 3: v3 metadata-driven extraction (no fallback — testing v3 directly) ───
      const config = await db.query.orgConfig.findFirst({
        where: eq(orgConfig.organizationId, organizationId),
      });
      const useET = config?.reguliInterpET ?? true;

      const opusStart = Date.now();
      let allFixed: any[] = [];
      let allInterpreted: any[] = [];
      let allScoring: any[] = [];
      let allElementDefs: any[] = [];
      let allDocRequirements: any[] = [];
      let extractionTruncated = false;
      let totalAIInputTokens = 0;
      let totalAIOutputTokens = 0;
      let guideMetadata: any = null;

      // v3: metadata-driven themed chunking
      const v3Result = await extractGuideV3(structuredText, organizationId, useET, (progress, message) => {
        publishJobProgress(organizationId, {
          jobId: job.id || "",
          jobType: "ghid",
          documentId,
          documentName: doc.name,
          progress: 30 + Math.round(progress * 0.55),
          status: "processing",
          message,
        }).catch(() => {});
      });

      allFixed = v3Result.fixedRules;
      allInterpreted = v3Result.interpretedRules;
      allScoring = v3Result.scoringCriteria;
      allElementDefs = v3Result.elementDefinitions;
      allDocRequirements = v3Result.documentRequirements;
      totalAIInputTokens = v3Result.totalInputTokens;
      totalAIOutputTokens = v3Result.totalOutputTokens;
      guideMetadata = v3Result.metadata;

      console.log(`[processGuide] v3 extraction: ${v3Result.durationMs}ms — ${allFixed.length} fixed, ${allInterpreted.length} interp, ${allScoring.length} scoring, ${allElementDefs.length} elements, ${allDocRequirements.length} docs`);

      /*
      // ─── FALLBACK: unified extraction (commented out — testing v3 directly) ───
      // Uncomment this block if v3 causes issues:
      } catch (v3Error: any) {
        console.warn(`[processGuide] v3 failed (${v3Error.message}), falling back to unified extraction`);
        const chunks = splitStructuredText(structuredText);
        if (chunks.length === 1) {
          const result = await unifiedExtraction(chunks[0], organizationId, "full", useET);
          allFixed = result.fixedRules; allInterpreted = result.interpretedRules;
          allScoring = result.scoringCriteria; allElementDefs = result.elementDefinitions;
          allDocRequirements = result.documentRequirements;
        } else {
          // ... chunk worker logic ...
        }
      }
      */

      const opusDuration = Date.now() - opusStart;
      console.log(`[processGuide] Extraction complete: ${opusDuration}ms — ${allFixed.length} fixed, ${allInterpreted.length} interpreted, ${allScoring.length} scoring, ${allElementDefs.length} element defs, ${allDocRequirements.length} doc requirements`);

      // ─── STEP 4: Save to DB ───
      await job.updateProgress(85);
      publishJobProgress(organizationId, {
        jobId: job.id || "",
        jobType: "ghid",
        documentId,
        documentName: doc.name,
        progress: 85,
        status: "processing",
        message: `Salvez ${allFixed.length + allInterpreted.length} reguli, ${allScoring.length} criterii selectie, ${allElementDefs.length} elemente`,
      }).catch((e: any) => console.warn("[processGuide] sse save progress:", e.message));

      let fixedCount: number, interpCount: number, scoringCount: number, elemDefCount: number;

      if (isSmartMerge) {
        // ─── SMART MERGE: compare with existing, add/update only new or changed ───
        console.log(`[processGuide] SMART MERGE mode for "${doc.name}"`);
        const mergeResult = await smartMergeGuideData(
          allFixed, allInterpreted, allScoring, allElementDefs,
          documentId, organizationId,
        );
        fixedCount = mergeResult.fixedCount;
        interpCount = mergeResult.interpCount;
        scoringCount = mergeResult.scoringCount;
        elemDefCount = mergeResult.elemDefCount;
        console.log(`[processGuide] Smart merge result: +${mergeResult.added} added, ~${mergeResult.updated} updated, =${mergeResult.unchanged} unchanged`);
      } else {
        // ─── FULL REPLACE: delete old data, re-insert (original behavior) ───
        // elementRuleLinks and ruleReferenceLinks cascade from rules, but clean elementDefinitions separately
        await db.delete(rules).where(and(eq(rules.documentId, documentId), eq(rules.organizationId, organizationId)));
        await db.delete(elementDefinitions).where(and(eq(elementDefinitions.guideDocumentId, documentId), eq(elementDefinitions.organizationId, organizationId)));

        [fixedCount, interpCount, scoringCount, elemDefCount] = await Promise.all([
          saveFixedRules(allFixed, documentId, organizationId),
          saveInterpretedRules(allInterpreted, documentId, organizationId),
          saveScoringCriteria(allScoring, documentId, organizationId),
          saveElementDefinitions(allElementDefs, documentId, organizationId),
        ]);
      }

      // ─── STEP 4.5 (Faza 3.5): Verify extraction completeness ───
      const completenessReport = verifyExtractionCompleteness(
        [...allFixed, ...allInterpreted],
        allScoring,
      );

      // Save trust score + document requirements on document
      try {
        await db.update(documents)
          .set({
            trustScore: String(completenessReport.trustScore),
            completenessReport,
            processingResult: {
              document_type: "guide",
              extracted_fields: [],
              raw_text: "",
              processing_time_ms: Date.now() - opusStart,
              document_requirements: allDocRequirements,
            } as any,
          })
          .where(eq(documents.id, documentId));
        console.log(`[processGuide] Saved ${allDocRequirements.length} document requirements to processingResult`);
      } catch (trustErr: any) {
        console.warn(`[processGuide] Could not save trust score / doc requirements: ${trustErr.message?.substring(0, 100)}`);
      }

      // SSE: broadcast trust score
      publishJobProgress(organizationId, {
        jobId: job.id || "",
        jobType: "ghid",
        documentId,
        documentName: doc.name,
        progress: 88,
        status: "processing",
        message: `Verific completitudinea extragerii...`,
        trustScore: completenessReport.trustScore,
        warnings: completenessReport.warnings,
      }).catch((e: any) => console.warn("[processGuide] sse completeness check:", e.message));

      if (completenessReport.trustScore < 0.7) {
        console.log(`[processGuide] ⚠ Low trust score (${completenessReport.trustScore}): ${completenessReport.warnings.join("; ")}`);
      }

      // ─── STEP 5: Auto-link rules to template elements and reference tables ───
      await job.updateProgress(92);
      publishJobProgress(organizationId, {
        jobId: job.id || "",
        jobType: "ghid",
        documentId,
        documentName: doc.name,
        progress: 92,
        status: "processing",
        message: `Conectez regulile la elementele de date si tabelele de referinta...`,
      }).catch((e: any) => console.warn("[processGuide] sse linking progress:", e.message));
      // Run Step 5 + Step 6 in parallel (independent of each other)
      const [linkResult, templateMappings] = await Promise.all([
        autoLinkRulesAndReferences(documentId, organizationId),
        (async () => {
          if (elemDefCount === 0) return 0;
          const templateDocs = await db.query.documents.findMany({
            where: and(
              eq(documents.organizationId, organizationId),
              eq(documents.processingType, "template"),
            ),
          });
          let mappings = 0;
          for (const tDoc of templateDocs) {
            mappings += await autoMapTemplatePlaceholders(tDoc.id, organizationId);
          }
          console.log(`[processGuide] Backfill mapping: ${templateDocs.length} template-uri re-procesate, ${mappings} mapări create`);
          return mappings;
        })(),
      ]);

      // ─── STEP 7: Extract reference tables from guide text (if any) ───
      // Many guides contain inline tables (CAEN lists, SO coefficients, zone ANC, scoring grids)
      // These are extracted as guideReferenceTables and auto-linked to rules
      const existingRefTables = await db.query.guideReferenceTables.findMany({
        where: eq(guideReferenceTables.documentId, documentId),
      });
      if (existingRefTables.length === 0) {
        // Only extract if no tables exist yet (avoid duplicates on reprocess)
        try {
          await extractTables(structuredText, DEFAULT_EXTRACTION_MODEL, documentId, organizationId);
          const newRefTables = await db.query.guideReferenceTables.findMany({
            where: eq(guideReferenceTables.documentId, documentId),
          });
          if (newRefTables.length > 0) {
            console.log(`[processGuide] Extracted ${newRefTables.length} reference tables from guide text`);
            // Re-run autoLink to connect rules with newly extracted tables
            await autoLinkRulesAndReferences(documentId, organizationId);
          }
        } catch (tableErr: any) {
          console.warn(`[processGuide] Table extraction from guide failed (non-critical):`, tableErr.message);
        }
      }

      // ─── FINALIZE ───
      const pageCount = preStructPageCount;
      const totalDuration = Date.now() - startTime;

      // Compute actual cost from tokens (Sonnet pricing)
      const modelPricing = DEFAULT_EXTRACTION_MODEL.includes("opus")
        ? { input: 15 / 1_000_000, output: 75 / 1_000_000 }
        : { input: 3 / 1_000_000, output: 15 / 1_000_000 };
      const actualAICost = (totalAIInputTokens * modelPricing.input) + (totalAIOutputTokens * modelPricing.output);

      // Quality metrics stored on the document
      const qualityMetrics = {
        pipeline: guideMetadata ? `v3_metadata_${DEFAULT_EXTRACTION_MODEL}` : `unified_${DEFAULT_EXTRACTION_MODEL}`,
        metadata: guideMetadata || null,
        truncated: extractionTruncated,
        continuations: 0,
        tokens: { input: totalAIInputTokens, output: totalAIOutputTokens },
        cost: { extraction: +actualAICost.toFixed(4), total: +actualAICost.toFixed(4) },
        counts: { fixedRules: fixedCount, interpretedRules: interpCount, scoringCriteria: scoringCount, elementDefinitions: elemDefCount },
        links: { elements: linkResult.elementLinks, references: linkResult.referenceLinks, templateMappings },
        duration: { total: totalDuration, extract: extractDuration, preStruct: preStructDuration, extraction: opusDuration },
      };

      await db.update(documents).set({
        status: "processed",
        pageCount,
        documentTypeClass: "guide" as any,
        processingResult: {
          ...qualityMetrics,
          document_requirements: allDocRequirements,
        },
        processedAt: new Date(),
      }).where(eq(documents.id, documentId));

      await job.updateProgress(100);

      const pipelineDesc = needsPreStructure
        ? `PyMuPDF + Sonnet pre-struct (${(preStructDuration / 1000).toFixed(1)}s) + ${DEFAULT_EXTRACTION_MODEL} (${(opusDuration / 1000).toFixed(1)}s)`
        : `PyMuPDF nativ + ${DEFAULT_EXTRACTION_MODEL} (${(opusDuration / 1000).toFixed(1)}s)`;
      const costDesc = `$${actualAICost.toFixed(2)}`;

      console.log(`[processGuide] Pipeline complete: ${totalDuration}ms total (extract: ${extractDuration}ms, pre-struct: ${preStructDuration}ms, AI: ${opusDuration}ms) for "${doc.name}" (${pageCount} pages, model=${DEFAULT_EXTRACTION_MODEL}, native=${!needsPreStructure})`);

      publishEvent(`org:${organizationId}:uploads`, "document_processed", {
        documentId,
        documentName: doc.name,
        status: "processed",
        processingType: "ghid",
        pageCount,
        fixedRules: fixedCount,
        interpretedRules: interpCount,
        scoringCriteria: scoringCount,
        elementDefinitions: elemDefCount,
        elementLinks: linkResult.elementLinks,
        referenceLinks: linkResult.referenceLinks,
        templateMappings,
        totalDurationMs: totalDuration,
        pipeline: needsPreStructure ? `gpt4o_prestructure + ${DEFAULT_EXTRACTION_MODEL}_et` : `native_pymupdf + ${DEFAULT_EXTRACTION_MODEL}_et`,
        costs: {
          preStructure: needsPreStructure ? "~$0.15" : "$0",
          extraction: `~$${actualAICost.toFixed(2)}`,
          total: costDesc,
        },
        message: `Ghid procesat "${doc.name}". ${pageCount} pagini. Pipeline: ${pipelineDesc}. ${fixedCount} reguli fixe, ${interpCount} interpretate, ${scoringCount} criterii selecție, ${elemDefCount} definiții elemente. ${linkResult.elementLinks + linkResult.referenceLinks} link-uri, ${templateMappings} mapări template. Total: ${(totalDuration / 1000).toFixed(1)}s, ${costDesc}.`,
      }).catch((e: any) => console.warn("[processGuide] sse guide processed:", e.message));
    } catch (error) {
      console.error(`Process guide error (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 3}):`, error);

      const isLastAttempt = (job.attemptsMade + 1) >= (job.opts.attempts || 3);
      const docStatus = isLastAttempt ? "failed" : "error";
      const errorMsg = error instanceof Error ? error.message : "Eroare necunoscută";
      await db.update(documents).set({ status: docStatus as any, processingError: errorMsg }).where(eq(documents.id, documentId));

      publishEvent(`org:${organizationId}:uploads`, "document_failed", {
        documentId,
        status: docStatus,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts || 3,
        willRetry: !isLastAttempt,
        errorMessage: errorMsg,
        message: isLastAttempt
          ? `Procesare eșuată definitiv "${job.data.documentId}": ${errorMsg}`
          : `Eroare la procesare (încercare ${job.attemptsMade + 1}/${job.opts.attempts || 3}), se reîncearcă...`,
      }).catch((e: any) => console.warn("[processGuide] sse document failed:", e.message));

      throw error;
    }
  },
  {
    connection: redis as any,
    concurrency: 1,
    limiter: { max: 2, duration: 60000 },
  },
);
