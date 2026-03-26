/**
 * Etapizat Guide Extraction Pipeline v2
 *
 * 6 focused extraction calls with prompt caching:
 * 1. Fixed rules (evaluator administrativ)
 * 2. Interpreted rules + ET (consultant care a pierdut dosare)
 * 3. Scoring criteria (evaluator tehnic)
 * 4. Elements (derivate din reguli + scoring) — depends on 1-3
 * 5. Document requirements (checklist complet)
 * 6. Reference tables (tabele din ghid)
 *
 * Calls 1,2,3,5,6 run in parallel (Faza 1).
 * Call 4 runs after 1-3 complete (Faza 2) — needs rules context.
 */
import { anthropic, withAILimit } from "../lib/anthropic";
import { logAIUsage } from "../services/aiUsage";
import { repairTruncatedJSON } from "../lib/safeExtract";
import { generateFieldListForPrompt } from "@dosarfonduri/shared";

const FIELD_LIST = generateFieldListForPrompt();
const MODEL = "claude-sonnet-4-6";

/** Shared consultant mindset — identical system prefix for cache hits */
const CONSULTANT_BASE = `Ești Solomon — consultant senior cu 15+ ani experiență în fonduri europene.
Citești ghidul ca un consultant care își riscă reputația.
O regulă omisă = un dosar respins. O excepție nedetectată = o contestație pierdută.
Caută CONFLICTE între secțiuni. Excepțiile sunt adesea în ALT capitol decât regula de bază.
Returnează DOAR JSON valid. Fără backticks, fără explicații.`;

// ─── EXTRACTION RESULT ───

export interface CategoryResult {
  data: any[];
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  truncated: boolean;
  durationMs: number;
}

export interface FullExtractionResult {
  fixedRules: any[];
  interpretedRules: any[];
  scoringCriteria: any[];
  elementDefinitions: any[];
  documentRequirements: any[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  truncated: boolean;
  durationMs: number;
}

// ─── GENERIC SINGLE-CATEGORY EXTRACTOR ───

async function extractCategory(
  systemSuffix: string,
  userMessage: string,
  categoryKey: string,
  organizationId: string,
  label: string,
  useET: boolean = false,
): Promise<CategoryResult> {
  // System prompt: shared base + specific suffix. Cache breakpoint on the base.
  const cachedSystem: any[] = [
    { type: "text", text: CONSULTANT_BASE, cache_control: { type: "ephemeral" } },
    { type: "text", text: systemSuffix },
  ];

  const requestParams: any = {
    model: MODEL,
    max_tokens: 16000,
    system: cachedSystem,
    messages: [{ role: "user", content: userMessage }],
  };

  if (useET) {
    requestParams.temperature = 1;
    requestParams.thinking = { type: "enabled", budget_tokens: 10000 };
  }

  const callStart = Date.now();
  const response: any = await withAILimit(() => (anthropic.messages.create as any)(requestParams));
  const durationMs = Date.now() - callStart;

  const textBlock = response.content.find((b: any) => b.type === "text");
  const content = textBlock ? textBlock.text : "";
  const cacheRead = response.usage.cache_read_input_tokens || 0;
  const cacheWrite = response.usage.cache_creation_input_tokens || 0;
  const truncated = response.stop_reason === "max_tokens";

  console.log(`[guideExtract] ${label} ${durationMs}ms in=${response.usage.input_tokens} out=${response.usage.output_tokens} cache_r=${cacheRead} cache_w=${cacheWrite}`);

  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model: MODEL,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: `extract_${label}`,
  });

  // Parse
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  let parsed: any = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = repairTruncatedJSON(content);
    if (parsed) {
      console.warn(`[guideExtract] Repaired truncated JSON for ${label}`);
    } else {
      console.error(`[guideExtract] Failed to parse ${label}. First 200: ${content.slice(0, 200)}`);
      return { data: [], inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cacheRead, cacheWrite, truncated: true, durationMs };
    }
  }

  const data = Array.isArray(parsed) ? parsed : Array.isArray(parsed[categoryKey]) ? parsed[categoryKey] : [];

  return { data, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cacheRead, cacheWrite, truncated, durationMs };
}

// ─── 6 CATEGORY EXTRACTORS ───

export function extractFixedRules(guideText: string, organizationId: string, label: string): Promise<CategoryResult> {
  return extractCategory(
    `\nGÂNDEȘTI CA UN EVALUATOR ADMINISTRATIV — ce respinge dosarul INSTANT?
Extragi REGULI FIXE — condiții binare verificabile automat (DA/NU):
Plafoane, forme juridice, CAEN-uri, vechime, zone, praguri achiziții, cheltuieli eligibile/neeligibile, TVA, deadline-uri.
Regulile ELIMINATORII → confidence ≥ 0.95. Referințe la anexe → menționează în source_text.
CLASIFICARE SEMANTICĂ: THRESHOLD, SCORING, TEMPORAL, DOCUMENT_BASED, DEPENDENCY, EXCLUSION, EXCEPTION, PROPORTIONAL, CLASSIFICATION.`,
    `Extrage TOATE regulile fixe din acest ghid.

CÂMPURI DISPONIBILE (folosește dacă se potrivesc, altfel creează chei noi snake_case):
${FIELD_LIST}

Returnează: { "fixed_rules": [{ "category": "eligibilitate|financiar|tehnic|administrativ|achizitii|documente", "description": "...", "condition": { "field": "...", "operator": "eq|neq|gt|gte|lt|lte|in|not_in|between", "value": "...", "value2": "..." }, "semantic_tags": [...], "source_page": N, "source_text": "...", "confidence": 0.0-1.0 }] }

TEXT GHID:
${guideText}`,
    "fixed_rules", organizationId, label,
  );
}

export function extractInterpretedRules(guideText: string, organizationId: string, label: string): Promise<CategoryResult> {
  return extractCategory(
    `\nGÂNDEȘTI CA UN CONSULTANT CARE A PIERDUT DOSARE din cauza excepțiilor nedetectate.
Extragi REGULI INTERPRETATE — condiții complexe cu arbori decizionali:
Intensitate sprijin, excepții, cazuri speciale, ajutor de stat/de minimis, achiziții cascadate.
TOATE ramurile decision tree documentate (nu doar cazul principal).
needs_review=true dacă ambiguă + review_reason.
CLASIFICARE SEMANTICĂ: THRESHOLD, SCORING, TEMPORAL, DOCUMENT_BASED, DEPENDENCY, EXCLUSION, EXCEPTION, PROPORTIONAL, CLASSIFICATION.`,
    `Extrage TOATE regulile interpretate din acest ghid.

CÂMPURI DISPONIBILE:
${FIELD_LIST}

Returnează: { "interpreted_rules": [{ "category": "selectie|intensitate|eligibilitate_complexa|documentare|achizitii|ajutor_stat", "description": "...", "condition": { "type": "decision_tree|scoring|cumulative|conditional", "logic": "...", "factors": [...], "outcomes": [{"if":"...","then":"..."}] }, "semantic_tags": [...], "source_page": N, "source_text": "...", "confidence": 0.0-1.0, "needs_review": true/false, "review_reason": "..." }] }

TEXT GHID:
${guideText}`,
    "interpreted_rules", organizationId, label, true, // useET
  );
}

export function extractScoring(guideText: string, organizationId: string, label: string): Promise<CategoryResult> {
  return extractCategory(
    `\nGÂNDEȘTI CA UN EVALUATOR TEHNIC care completează grila de punctaj.
Extragi CRITERII DE SELECȚIE — cod, nume, punctaj maxim, categorie, logica evaluare completă.
Capturează TOATĂ structura tabelelor de punctaj (toate intervalele/pragurile).
Dacă sunt componente/sub-măsuri diferite cu grile separate, extrage-le pe TOATE.`,
    `Extrage TOATE criteriile de selecție/punctaj din acest ghid.

Returnează: { "scoring_criteria": [{ "code": "...", "name": "...", "description": "...", "maxPoints": N, "category": "tehnic|financiar|management|relevant|sustenabilitate", "sourcePage": N, "evaluationLogic": { "type": "lookup|range|boolean|formula", "elementKey": "...", "ranges": [{"min":N,"max":N,"points":N}], "formula": "...", "lookupColumn": "..." } }] }

TEXT GHID:
${guideText}`,
    "scoring_criteria", organizationId, label,
  );
}

export function extractDocumentRequirements(guideText: string, organizationId: string, label: string): Promise<CategoryResult> {
  return extractCategory(
    `\nUN DOCUMENT LIPSĂ = DOSAR RESPINS ADMINISTRATIV.
Extragi TOATE documentele pe care solicitantul trebuie să le depună:
- Secțiunea "Documente necesare" / "Conținut dosar" / "Lista documentelor"
- Tabelul/grila documentelor din ghid sau anexe
- Mențiuni dispersate ("va prezenta", "va anexa", "se va depune")
- Documente implicate de reguli (dacă e necesar certificat fiscal → "Certificat fiscal ANAF")
FIECARE document SEPARAT. Include CONDIȚIILE (doar pentru SRL, doar dacă valoare > X).`,
    `Extrage TOATE documentele necesare din acest ghid.

Returnează: { "document_requirements": [{ "name": "...", "category": "juridice|financiare|tehnice|declaratii|oferte|anexe|altele", "required": true, "description": "...", "format": "PDF|DOCX|XLSX|original|copie_conforma|orice", "source_page": null, "conditions": null }] }

TEXT GHID:
${guideText}`,
    "document_requirements", organizationId, label,
  );
}

export function extractElements(
  guideText: string,
  rulesContext: string,
  organizationId: string,
  label: string,
): Promise<CategoryResult> {
  return extractCategory(
    `\nPREGĂTEȘTI DOSARUL — ce DATE îi trebuie consultantului?
Primești regulile și criteriile de scoring deja extrase. Pentru FIECARE:
a) Regulă fixă → ce câmp verifică? → creează element
b) Regulă interpretată → ce factori intră în arbore? → element per factor
c) Criteriu scoring → ce date se evaluează? → creează element
NU te limita la lista predefinită — creează chei noi specifice programului (snake_case).
REGULA DE AUR: Dacă un consultant are nevoie de o informație pentru a completa cererea de finanțare sau pentru a evalua un criteriu, informația TREBUIE să fie un element.
CARDINALITATE: "3 oferte" → min_count=3.`,
    `Extrage TOATE elementele de date necesare din acest ghid.

REGULI ȘI CRITERII DEJA EXTRASE (derivă elementele din ele):
${rulesContext}

CÂMPURI PREDEFINITE (punct de plecare, NU limită):
${FIELD_LIST}

Returnează: { "element_definitions": [{ "element_key": "snake_case", "display_name": "...", "category": "beneficiary|farm|investment|location|financial|legal|technical|other", "data_type": "number|text|enum|boolean|date|document_ref|list_items", "unit": null, "enum_values": null, "required": true/false, "help_text": "...", "is_derived": false, "derivation_formula": null, "source_priority": ["document_extracted","solomon_chat","consultant_manual"], "collection_order": N, "min_count": 1, "max_count": null }] }

TEXT GHID:
${guideText}`,
    "element_definitions", organizationId, label,
  );
}

// ─── FULL ETAPIZAT EXTRACTION (orchestrator per chunk) ───

export async function extractAllFromChunk(
  guideText: string,
  organizationId: string,
  chunkLabel: string,
): Promise<FullExtractionResult> {
  const start = Date.now();

  // FAZA 1: 5 apeluri paralele (cache write pe primul, cache read pe restul)
  const [fixedRes, interpRes, scoringRes, docsRes] = await Promise.all([
    extractFixedRules(guideText, organizationId, `${chunkLabel}_fixed`),
    extractInterpretedRules(guideText, organizationId, `${chunkLabel}_interp`),
    extractScoring(guideText, organizationId, `${chunkLabel}_scoring`),
    extractDocumentRequirements(guideText, organizationId, `${chunkLabel}_docs`),
  ]);

  // FAZA 2: Elemente — depind de regulile + scoringul extras
  const rulesContext = [
    `REGULI FIXE (${fixedRes.data.length}):`,
    ...fixedRes.data.slice(0, 30).map((r: any) => `- ${r.description?.slice(0, 100)} [field: ${r.condition?.field || "?"}]`),
    `REGULI INTERPRETATE (${interpRes.data.length}):`,
    ...interpRes.data.slice(0, 20).map((r: any) => `- ${r.description?.slice(0, 100)} [factors: ${r.condition?.factors?.join(", ") || "?"}]`),
    `CRITERII SCORING (${scoringRes.data.length}):`,
    ...scoringRes.data.slice(0, 20).map((r: any) => `- ${r.code} ${r.name} (${r.maxPoints}p) [elementKey: ${r.evaluationLogic?.elementKey || "?"}]`),
  ].join("\n");

  const elemRes = await extractElements(guideText, rulesContext, organizationId, `${chunkLabel}_elements`);

  const durationMs = Date.now() - start;
  const allResults = [fixedRes, interpRes, scoringRes, docsRes, elemRes];

  console.log(`[guideExtract] ${chunkLabel} complete: ${durationMs}ms — ${fixedRes.data.length} fixed, ${interpRes.data.length} interp, ${scoringRes.data.length} scoring, ${docsRes.data.length} docs, ${elemRes.data.length} elements`);

  return {
    fixedRules: fixedRes.data,
    interpretedRules: interpRes.data,
    scoringCriteria: scoringRes.data,
    elementDefinitions: elemRes.data,
    documentRequirements: docsRes.data,
    totalInputTokens: allResults.reduce((s, r) => s + r.inputTokens, 0),
    totalOutputTokens: allResults.reduce((s, r) => s + r.outputTokens, 0),
    totalCacheRead: allResults.reduce((s, r) => s + r.cacheRead, 0),
    totalCacheWrite: allResults.reduce((s, r) => s + r.cacheWrite, 0),
    truncated: allResults.some(r => r.truncated),
    durationMs,
  };
}
