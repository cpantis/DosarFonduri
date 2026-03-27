/**
 * Guide Extraction Pipeline v3 — Metadata-driven chunking
 *
 * Step 0: Extract guide metadata (1 small AI call, ~15s)
 *   → program, measure, deadline, sections with page ranges
 *
 * Step 1: Parallel themed chunks (based on metadata sections)
 *   → Each chunk has a focused prompt for its section type
 *   → No overlap, no dedup needed — sections are disjoint
 *
 * Step 2: Derive elements from extracted rules + scoring
 *   → 1 final call with rules context
 *
 * Total: ~70s for 62-page guide (vs 4-5 min with v1)
 */
import { anthropic, withAILimit } from "../lib/anthropic";
import { logAIUsage } from "../services/aiUsage";
import { repairTruncatedJSON } from "../lib/safeExtract";
import { generateFieldListForPrompt } from "@dosarfonduri/shared";

const FIELD_LIST = generateFieldListForPrompt();
const MODEL = "claude-sonnet-4-6";

// ─── STEP 0: METADATA EXTRACTION ───

const METADATA_SYSTEM = `Ești Solomon — consultant senior fonduri europene. Analizezi rapid structura unui ghid de finanțare.
Returnează DOAR JSON valid. Fără backticks, fără explicații.`;

const METADATA_USER = (sampleText: string) => `Analizează acest ghid de finanțare și extrage metadatele structurale.
Citește cuprinsul și primele/ultimele pagini pentru a identifica secțiunile.

Returnează:
{
  "program": "numele programului (PNDR, PNRR, POC, etc.)",
  "masura": "codul măsurii (sM 4.1, M2, etc.)",
  "componenta": "componenta specifică dacă există",
  "sesiune": "anul/perioada sesiunii",
  "deadline": "data limită depunere sau null",
  "plafon_maxim_eur": number sau null,
  "intensitate_maxima_pct": number sau null,
  "prag_minim_punctaj": number sau null,
  "beneficiari_eligibili": ["lista formelor juridice acceptate"],
  "sectiuni": [
    {
      "tip": "info|eligibilitate|selectie_punctaj|cheltuieli|intensitate|contractare|documente|monitorizare|anexe",
      "titlu": "Titlul secțiunii din cuprins",
      "pagina_start": number,
      "pagina_end": number
    }
  ]
}

IMPORTANT: Secțiunile trebuie să acopere TOATE paginile ghidului. Nu omite nicio secțiune.
Tipurile de secțiuni:
- "info": informații generale, definiții, descriere program
- "eligibilitate": condiții eligibilitate, beneficiari, criterii eliminatorii
- "selectie_punctaj": grila de punctaj, criterii selecție, scoruri
- "cheltuieli": cheltuieli eligibile/neeligibile, buget, plafoane
- "intensitate": rata sprijinului, majorări, ajutor de stat
- "contractare": termene, plăți, avans, modificări contract
- "documente": lista documentelor necesare, cerințe documentare
- "monitorizare": obligații post-implementare, durabilitate
- "anexe": anexe, tabele de referință, formulare

TEXT GHID:
${sampleText}`;

export interface GuideMetadata {
  program: string;
  masura: string;
  componenta: string;
  sesiune: string;
  deadline: string | null;
  plafon_maxim_eur: number | null;
  intensitate_maxima_pct: number | null;
  prag_minim_punctaj: number | null;
  beneficiari_eligibili: string[];
  sectiuni: Array<{
    tip: string;
    titlu: string;
    pagina_start: number;
    pagina_end: number;
  }>;
}

export async function extractGuideMetadata(
  fullText: string,
  organizationId: string,
): Promise<GuideMetadata> {
  // Send first 200 chars per page (enough for structure detection)
  const pageDelimiter = /--- Pagina (\d+) ---/g;
  const pageStarts: Array<{ page: number; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = pageDelimiter.exec(fullText)) !== null) {
    pageStarts.push({ page: parseInt(m[1], 10), start: m.index });
  }

  const summaryParts: string[] = [];
  for (let i = 0; i < pageStarts.length; i++) {
    const end = i + 1 < pageStarts.length ? pageStarts[i + 1].start : fullText.length;
    const pageText = fullText.slice(pageStarts[i].start, end);
    const contentStart = pageText.indexOf("\n") + 1;
    const preview = pageText.slice(contentStart, contentStart + 250).trim();
    summaryParts.push(`Pagina ${pageStarts[i].page}: ${preview}`);
  }

  const response: any = await withAILimit(() => (anthropic.messages.create as any)({
    model: MODEL,
    max_tokens: 3000,
    system: METADATA_SYSTEM,
    messages: [{ role: "user", content: METADATA_USER(summaryParts.join("\n")) }],
  }));

  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model: MODEL,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: "guide_metadata",
  });

  const textBlock = response.content.find((b: any) => b.type === "text");
  const content = textBlock ? textBlock.text : "{}";
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const repaired = repairTruncatedJSON(content);
    if (repaired) return repaired;
    // Fallback: single section covering all pages
    return {
      program: "N/A", masura: "N/A", componenta: "", sesiune: "",
      deadline: null, plafon_maxim_eur: null, intensitate_maxima_pct: null,
      prag_minim_punctaj: null, beneficiari_eligibili: [],
      sectiuni: [{ tip: "eligibilitate", titlu: "Ghid complet", pagina_start: 1, pagina_end: pageStarts.length }],
    };
  }
}

// ─── STEP 1: THEMED CHUNK EXTRACTION ───

/** Extract pages by range from full text */
function extractPageRange(fullText: string, startPage: number, endPage: number): string {
  const pageDelimiter = /--- Pagina (\d+) ---/g;
  const pageStarts: Array<{ page: number; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = pageDelimiter.exec(fullText)) !== null) {
    pageStarts.push({ page: parseInt(m[1], 10), start: m.index });
  }

  const parts: string[] = [];
  for (let i = 0; i < pageStarts.length; i++) {
    if (pageStarts[i].page >= startPage && pageStarts[i].page <= endPage) {
      const end = i + 1 < pageStarts.length ? pageStarts[i + 1].start : fullText.length;
      parts.push(fullText.slice(pageStarts[i].start, end));
    }
  }
  return parts.join("\n");
}

/** Focused prompt per section type — written with consultant mindset */
const SECTION_PROMPTS: Record<string, { system: string; outputKeys: string[] }> = {
  eligibilitate: {
    system: `Ești consultant senior cu 15+ ani experiență în fonduri europene. Ai văzut sute de dosare respinse la evaluarea administrativă.

EXTRAGI REGULI FIXE — condiții verificabile automat contra datelor unei firme:
- Forme juridice acceptate/excluse (SRL, SA, PFA, II, IF...)
- Praguri financiare exacte (capitaluri proprii > 0, CA minim, angajați minim/maxim)
- Vechime minimă (ani de la înființare, ani de activitate în CAEN)
- Coduri CAEN eligibile/excluse (liste, grupări, excepții)
- Condiții de stare: nu în insolvență, nu în dificultate, nu radiat
- Dimensiune IMM (micro/mică/mijlocie — praguri angajați + CA/active)
- Condiții geografice cuantificabile (regiuni eligibile, urban/rural, zone defavorizate)
- Condiții despre ajutoare anterioare (de minimis, dubla finanțare)
- Obligații fiscale (certificat fiscal, datorii buget stat)

ATENȚIE LA:
- "Cel puțin" / "minimum" / "maximum" → operator gte/lte cu valoare exactă
- "Cu excepția" / "Nu sunt eligibile" → regulă separată cu operator neq/not_in
- Condiții cumulative (A ȘI B) → reguli separate, fiecare cu confidence proprie
- Anexe referite (lista CAEN, zone eligibile) → menționează sursa

NU extrage reguli care necesită interpretare subiectivă (ex: "proiect viabil", "experiență relevantă").
Returnează DOAR JSON valid. Fără backticks, fără explicații.`,
    outputKeys: ["fixed_rules"],
  },
  selectie_punctaj: {
    system: `Ești evaluator tehnic cu 15+ ani experiență. Ai evaluat sute de dosare cu grila de punctaj și știi că diferența între finanțat și respins e de 1-2 puncte.

EXTRAGI FIECARE criteriu de selecție. Nu omite NICIUN subcriteriu.

CUM ARATĂ O GRILĂ DE PUNCTAJ:
- Criterii principale (CS1, P1, S1...) cu punctaj maxim
- SUBcriterii (CS1.1, CS1.2...) — FIECARE e un criteriu separat
- Logică de acordare: praguri (0-5 ani = 5p, 5-10 = 10p), DA/NU, formule, tabele lookup
- Unele criterii au "tot sau nimic" (10p sau 0p), altele au gradare

PENTRU FIECARE CRITERIU extrage:
- cod: EXACT cum apare în ghid (CS1, CS1.1, P1, S1...)
- name: titlul complet
- maxPoints: punctajul MAXIM (nu total, ci per criteriu)
- description: ce se evaluează + condiții exacte de acordare
- evaluationLogic: CUM se calculează — praguri, formule, referințe la tabele din anexe
  - type "range": pentru praguri (ex: 0-50ha=5p, 50-100ha=10p)
  - type "boolean": DA/NU (ex: are certificare eco = 15p)
  - type "lookup": verificare în tabele din anexe
  - type "formula": calcul matematic

ATENȚIE: Dacă ghidul menționează "conform anexei X" pentru un criteriu, include referința exactă.
Returnează DOAR JSON valid. Fără backticks, fără explicații.`,
    outputKeys: ["scoring_criteria"],
  },
  cheltuieli: {
    system: `Ești consultant senior care a pierdut dosare din cauza cheltuielilor neeligibile declarate greșit.

EXTRAGI REGULI FIXE despre cheltuieli:
- Cheltuieli ELIGIBILE: fiecare categorie separată (construcții, echipamente, servicii, consultanță, proiectare...)
- Cheltuieli NEELIGIBILE: fiecare tip separat (TVA recuperabil, terenuri, achiziții SH, leasing...)
- PLAFOANE: procent maxim din total (consultanță ≤ 5%, proiectare ≤ 10%, general ≤ 15%...)
- Condiții specifice: "doar dacă", "cu excepția", "maximum X% din valoarea totală"
- TVA: eligibilă integral / parțial / neeligibilă + condiții
- Contribuție proprie minimă (cofinanțare)
- Avans maxim
- Valoare minimă/maximă proiect (EUR sau RON)

FIECARE regulă = o intrare separată. Nu combina mai multe condiții într-o singură regulă.
Folosește field-uri cuantificabile: "valoare_investitie", "cofinantare_pct", "cheltuieli_consultanta_pct".
Returnează DOAR JSON valid. Fără backticks, fără explicații.`,
    outputKeys: ["fixed_rules"],
  },
  documente: {
    system: `Ești consultant senior — știi că un singur document lipsă sau în format greșit = dosar respins la verificarea administrativă.

EXTRAGI ABSOLUT TOATE documentele necesare la depunere:
- Din secțiunea dedicată "Documente necesare" / "Lista de verificare"
- Din mențiuni dispersate în alte capitole ("se va atașa...", "se va prezenta...", "solicitantul va depune...")
- Din cerințe de eligibilitate care presupun un document (ex: "să nu fie în insolvență" → certificat constatator)

PENTRU FIECARE DOCUMENT:
- name: denumirea EXACTĂ din ghid
- category: juridice / financiare / tehnice / declaratii / oferte / anexe / altele
- required: true dacă obligatoriu, false dacă "după caz" / "dacă este cazul"
- description: CE trebuie să conțină, CINE îl emite, CE trebuie să ateste
- format: original / copie_conformă / PDF / DOCX / orice
- conditions: "doar pentru SRL", "doar dacă valoarea > 100.000 EUR", null dacă universal

ATENȚIE:
- Documente care par evidente dar nu sunt listate explicit → NU le adăuga
- "Copie conformă cu originalul" ≠ "original"
- Unele documente au termen de valabilitate (ex: certificat fiscal ≤ 30 zile)
- Anexele specifice programului (Cererea de finanțare, Plan de afaceri, Studiu de fezabilitate) sunt documente separate
Returnează DOAR JSON valid. Fără backticks, fără explicații.`,
    outputKeys: ["document_requirements"],
  },
  contractare: {
    system: `Ești consultant senior cu experiență în contractare și implementare proiecte europene.

EXTRAGI REGULI FIXE despre:
- Termene: de depunere, de evaluare, de contractare, de implementare
- Plăți: avans (procent + condiții), tranșe, plată finală
- Garanții: scrisoare bancară, garanție de bună execuție
- Achiziții: praguri PRAG (licitație deschisă, cerere oferte, achiziție directă) + obligații
- Modificări contract: ce se poate modifica, ce nu, cât % din valoare
- Sancțiuni: corecții financiare, reziliere, rambursare
- Monitorizare: perioade, indicatori obligatorii, raportări
- Durabilitate: câți ani după finalizare, ce obligații (locuri de muncă, activitate, CAEN)

Fiecare regulă separată cu field verificabil (ex: "durata_implementare_luni" lte 24).
Returnează DOAR JSON valid. Fără backticks, fără explicații.`,
    outputKeys: ["fixed_rules"],
  },
};

/** Build user prompt based on section type */
function buildSectionUserPrompt(sectionType: string, guideText: string): string {
  const outputSchemas: Record<string, string> = {
    fixed_rules: `"fixed_rules": [{ "category": "eligibilitate|financiar|tehnic|administrativ|achizitii|documente", "description": "Descriere clară și concisă a regulii — formulată ca condiție de verificat", "condition": { "field": "cheia_din_campuri_disponibile_sau_noua", "operator": "eq|neq|gt|gte|lt|lte|in|not_in|between", "value": "valoare_exacta", "value2": "pentru_between" }, "semantic_tags": ["eligibilitate_beneficiar", "prag_financiar"], "source_page": N, "source_text": "citatul EXACT din ghid (max 200 caractere)", "confidence": 0.0-1.0 }]`,
    scoring_criteria: `"scoring_criteria": [{ "code": "codul_din_grila (CS1, P1, S1.2...)", "name": "titlul complet al criteriului", "description": "ce se evaluează + condiții de acordare + praguri", "maxPoints": N, "category": "tehnic|financiar|management|relevant|sustenabilitate", "sourcePage": N, "evaluationLogic": { "type": "lookup|range|boolean|formula", "elementKey": "cheia_elementului_care_se_verifica", "ranges": [{"min":0,"max":50,"points":5},{"min":50,"max":100,"points":10}], "formula": null } }]`,
    document_requirements: `"document_requirements": [{ "name": "denumirea EXACTĂ din ghid", "category": "juridice|financiare|tehnice|declaratii|oferte|anexe|altele", "required": true, "description": "ce conține, cine îl emite, ce atestă, termen valabilitate", "format": "PDF|DOCX|XLSX|original|copie_conforma|orice", "source_page": N, "conditions": "doar dacă... / null dacă universal" }]`,
  };

  const prompt = SECTION_PROMPTS[sectionType];
  if (!prompt) return `Extrage informatiile relevante.\n\nTEXT:\n${guideText}`;

  const schemas = prompt.outputKeys.map(k => outputSchemas[k] || "").filter(Boolean).join(", ");

  const needsFields = ["eligibilitate", "cheltuieli", "contractare"].includes(sectionType);
  return `Extrage din această secțiune a ghidului de finanțare.

${needsFields ? `CÂMPURI DISPONIBILE (folosește field-urile din această listă în condition.field):\n${FIELD_LIST}\n\nDacă o regulă nu se mapează pe niciun câmp existent, creează un field nou descriptiv (snake_case).\n` : ""}
Returnează: { ${schemas} }

TEXT GHID:
${guideText}`;
}

interface SectionResult {
  fixedRules: any[];
  scoringCriteria: any[];
  documentRequirements: any[];
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

async function extractSection(
  sectionType: string,
  guideText: string,
  organizationId: string,
  label: string,
  useET: boolean = false,
): Promise<SectionResult> {
  const prompt = SECTION_PROMPTS[sectionType] || SECTION_PROMPTS["eligibilitate"];

  const requestParams: any = {
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: prompt.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildSectionUserPrompt(sectionType, guideText) }],
  };

  if (useET && (sectionType === "eligibilitate" || sectionType === "intensitate")) {
    requestParams.temperature = 1;
    requestParams.thinking = { type: "enabled", budget_tokens: 10000 };
  }

  const callStart = Date.now();
  const response: any = await withAILimit(() => (anthropic.messages.create as any)(requestParams));
  const durationMs = Date.now() - callStart;

  const textBlock = response.content.find((b: any) => b.type === "text");
  const content = textBlock ? textBlock.text : "";

  console.log(`[guideV3] ${label} ${durationMs}ms in=${response.usage.input_tokens} out=${response.usage.output_tokens}`);

  // Debug: log raw response when output is suspiciously small or truncated
  if (response.usage.output_tokens < 500) {
    console.warn(`[guideV3] ⚠ LOW OUTPUT for ${label} (${response.usage.output_tokens} tokens, stop=${response.stop_reason}): "${content.slice(0, 500)}"`);
  }
  if (response.stop_reason === "max_tokens") {
    console.warn(`[guideV3] ⚠ TRUNCATED for ${label} — hit max_tokens limit`);
  }

  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model: MODEL,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: `extract_${label}`,
  });

  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  let parsed: any = null;
  try { parsed = JSON.parse(cleaned); } catch { parsed = repairTruncatedJSON(content); }
  if (!parsed) parsed = {};

  return {
    fixedRules: Array.isArray(parsed.fixed_rules) ? parsed.fixed_rules : [],
    scoringCriteria: Array.isArray(parsed.scoring_criteria) ? parsed.scoring_criteria : [],
    documentRequirements: Array.isArray(parsed.document_requirements) ? parsed.document_requirements : [],
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
  };
}

// ─── STEP 2: DERIVE ELEMENTS ───

async function deriveElements(
  rules: any[],
  scoring: any[],
  guideText: string,
  organizationId: string,
): Promise<{ elements: any[]; inputTokens: number; outputTokens: number }> {
  const rulesContext = [
    `REGULI (${rules.length}):`,
    ...rules.slice(0, 40).map((r: any) => `- ${(r.description || "").slice(0, 120)} [field: ${r.condition?.field || "?"}]`),
    `CRITERII SCORING (${scoring.length}):`,
    ...scoring.slice(0, 20).map((s: any) => `- ${s.code} ${s.name} (${s.maxPoints}p) [elementKey: ${s.evaluationLogic?.elementKey || "?"}]`),
  ].join("\n");

  const response: any = await withAILimit(() => (anthropic.messages.create as any)({
    model: MODEL,
    max_tokens: 12000,
    system: `Ești consultant senior care pregătește dosarul de finanțare. Gândești ca evaluatorul: ce DATE concrete trebuie colectate pentru a DEMONSTRA eligibilitatea și a MAXIMIZA punctajul?

MINDSET:
- Fiecare regulă de eligibilitate necesită un câmp de date verificabil
- Fiecare criteriu de selecție necesită datele din care se calculează punctajul
- Datele financiare se extrag automat din bilanț → marcate autoPopulated
- Datele despre proiect se colectează de la consultant → source "solomon_chat" sau "consultant_manual"
- Datele din documente se extrag automat → source "document_extracted"

NU crea câmpuri generice ("observatii", "comentarii"). Fiecare element trebuie să aibă scop concret:
- fie alimentează o regulă de eligibilitate (ex: "angajati" → regula "minim 1 angajat")
- fie alimentează un criteriu de punctaj (ex: "suprafata_agricola_ha" → punctaj criteriu CS1)
- fie e necesar pentru completarea unui document (ex: "reprezentant_legal" → Cerere de finanțare)

Returnează DOAR JSON valid.`,
    messages: [{ role: "user", content: `Derivă elementele de date necesare din regulile și criteriile extrase.

REGULI ȘI CRITERII EXTRASE:
${rulesContext}

CÂMPURI PREDEFINITE (punct de plecare — folosește-le ca bază, adaugă ce lipsește):
${FIELD_LIST}

Returnează: { "element_definitions": [{ "element_key": "snake_case", "display_name": "...", "category": "beneficiary|farm|investment|location|financial|legal|technical|other", "data_type": "number|text|enum|boolean|date|document_ref|list_items", "unit": null, "enum_values": null, "required": true/false, "help_text": "Ce valoare se așteaptă și de ce e importantă", "is_derived": false, "derivation_formula": null, "source_priority": ["document_extracted","solomon_chat","consultant_manual"], "collection_order": N, "min_count": 1, "max_count": null }] }

TEXT GHID (primele pagini, pentru context):
${guideText.slice(0, 10000)}` }],
  }));

  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model: MODEL,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: "derive_elements",
  });

  const textBlock = response.content.find((b: any) => b.type === "text");
  const content = textBlock ? textBlock.text : "";
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  let parsed: any = null;
  try { parsed = JSON.parse(cleaned); } catch { parsed = repairTruncatedJSON(content); }

  return {
    elements: Array.isArray(parsed?.element_definitions) ? parsed.element_definitions : [],
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ─── ORCHESTRATOR ───

export interface ProcessingLogEntry {
  step: string;
  label: string;
  durationMs: number;
  tokens?: { input: number; output: number };
  details?: string;
}

export interface V3ExtractionResult {
  metadata: GuideMetadata;
  fixedRules: any[];
  scoringCriteria: any[];
  elementDefinitions: any[];
  documentRequirements: any[];
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
  processingLog: ProcessingLogEntry[];
}

export async function extractGuideV3(
  fullText: string,
  organizationId: string,
  useET: boolean,
  onProgress?: (progress: number, message: string) => void,
): Promise<V3ExtractionResult> {
  const start = Date.now();
  let totalIn = 0;
  let totalOut = 0;
  const processingLog: ProcessingLogEntry[] = [];

  // STEP 0: Metadata (~15s)
  const step0Start = Date.now();
  onProgress?.(10, "Analizez structura ghidului...");
  const metadata = await extractGuideMetadata(fullText, organizationId);
  const step0Ms = Date.now() - step0Start;
  console.log(`[guideV3] Step 0 (metadata): ${step0Ms}ms — ${metadata.program} ${metadata.masura}, ${metadata.sectiuni.length} secțiuni`);
  processingLog.push({
    step: "0",
    label: "Metadata extraction",
    durationMs: step0Ms,
    details: `${metadata.program} ${metadata.masura}, ${metadata.sectiuni.length} secțiuni detectate`,
  });
  onProgress?.(15, `Structura detectata in ${(step0Ms/1000).toFixed(1)}s — ${metadata.sectiuni.length} sectiuni`);

  // Group sections by type for extraction
  // Note: "intensitate" removed — complex intensity rules evaluated by Solomon via RAG
  const extractableSections = metadata.sectiuni.filter(s =>
    ["eligibilitate", "selectie_punctaj", "cheltuieli", "documente", "contractare"].includes(s.tip)
  );

  // Merge adjacent sections of same type
  const mergedSections: Array<{ tip: string; pagina_start: number; pagina_end: number; titlu: string }> = [];
  for (const s of extractableSections) {
    const last = mergedSections[mergedSections.length - 1];
    if (last && last.tip === s.tip && s.pagina_start <= last.pagina_end + 2) {
      last.pagina_end = Math.max(last.pagina_end, s.pagina_end);
    } else {
      mergedSections.push({ ...s });
    }
  }

  // Split large sections (>10 pages) into sub-chunks to avoid bottleneck
  const MAX_SECTION_PAGES = 10;
  const finalSections: Array<{ tip: string; pagina_start: number; pagina_end: number; titlu: string }> = [];
  for (const s of mergedSections) {
    const pageSpan = s.pagina_end - s.pagina_start + 1;
    if (pageSpan > MAX_SECTION_PAGES) {
      // Split into sub-sections of MAX_SECTION_PAGES each
      for (let start = s.pagina_start; start <= s.pagina_end; start += MAX_SECTION_PAGES) {
        const end = Math.min(start + MAX_SECTION_PAGES - 1, s.pagina_end);
        finalSections.push({ tip: s.tip, pagina_start: start, pagina_end: end, titlu: `${s.titlu} (p${start}-${end})` });
      }
    } else {
      finalSections.push(s);
    }
  }
  // Replace mergedSections with split version
  mergedSections.length = 0;
  mergedSections.push(...finalSections);

  if (mergedSections.length === 0) {
    // Fallback: treat entire guide as one eligibility section
    const totalPages = (fullText.match(/--- Pagina \d+/g) || []).length;
    mergedSections.push({ tip: "eligibilitate", pagina_start: 1, pagina_end: totalPages, titlu: "Ghid complet" });
  }

  console.log(`[guideV3] ${mergedSections.length} secțiuni de extras: ${mergedSections.map(s => `${s.tip}(${s.pagina_start}-${s.pagina_end})`).join(", ")}`);

  // STEP 1: Parallel themed extraction
  const step1Start = Date.now();
  onProgress?.(25, `Extrag din ${mergedSections.length} sectiuni paralel...`);

  const sectionTimings: Array<{ tip: string; durationMs: number; results: string }> = [];
  const sectionResults = await Promise.all(
    mergedSections.map(async (section, i) => {
      const text = extractPageRange(fullText, section.pagina_start, section.pagina_end);
      if (text.length < 100) return null;
      const sStart = Date.now();
      const result = await extractSection(
        section.tip,
        text,
        organizationId,
        `${section.tip}_p${section.pagina_start}-${section.pagina_end}`,
        useET,
      );
      const sDur = Date.now() - sStart;
      const rCount = result.fixedRules.length + result.scoringCriteria.length + result.documentRequirements.length;
      sectionTimings.push({ tip: section.tip, durationMs: sDur, results: `${rCount} items` });
      processingLog.push({
        step: "1",
        label: `${section.tip} (p${section.pagina_start}-${section.pagina_end})`,
        durationMs: sDur,
        tokens: { input: result.inputTokens, output: result.outputTokens },
        details: `${result.fixedRules.length} fixe, ${result.scoringCriteria.length} scoring, ${result.documentRequirements.length} docs`,
      });
      onProgress?.(25 + Math.round(((i + 1) / mergedSections.length) * 50), `${section.titlu} — ${(sDur/1000).toFixed(0)}s, ${rCount} rezultate`);
      return result;
    }),
  );
  const step1Ms = Date.now() - step1Start;
  processingLog.push({
    step: "1_total",
    label: "All sections (parallel)",
    durationMs: step1Ms,
    details: `${mergedSections.length} secțiuni, wall time ${(step1Ms/1000).toFixed(1)}s`,
  });
  console.log(`[guideV3] Step 1 (sections): ${step1Ms}ms — ${sectionTimings.map(t => `${t.tip}:${t.durationMs}ms(${t.results})`).join(", ")}`);

  // Merge results
  let allFixed: any[] = [];
  let allScoring: any[] = [];
  let allDocs: any[] = [];

  for (const result of sectionResults) {
    if (!result) continue;
    allFixed.push(...result.fixedRules);
    allScoring.push(...result.scoringCriteria);
    allDocs.push(...result.documentRequirements);
    totalIn += result.inputTokens;
    totalOut += result.outputTokens;
  }

  // STEP 2: Derive elements from rules + scoring
  const step2Start = Date.now();
  onProgress?.(80, `Derivez elementele din ${allFixed.length} reguli...`);
  const allRules = [...allFixed];
  const elemResult = await deriveElements(allRules, allScoring, fullText, organizationId);
  const step2Ms = Date.now() - step2Start;
  totalIn += elemResult.inputTokens;
  totalOut += elemResult.outputTokens;
  processingLog.push({
    step: "2",
    label: "Derive elements",
    durationMs: step2Ms,
    tokens: { input: elemResult.inputTokens, output: elemResult.outputTokens },
    details: `${elemResult.elements.length} elemente derivate din ${allRules.length} reguli + ${allScoring.length} criterii`,
  });
  console.log(`[guideV3] Step 2 (elements): ${step2Ms}ms — ${elemResult.elements.length} elements`);

  const durationMs = Date.now() - start;
  processingLog.push({
    step: "total",
    label: "Pipeline complete",
    durationMs,
    tokens: { input: totalIn, output: totalOut },
    details: `${allFixed.length} fixed, ${allScoring.length} scoring, ${elemResult.elements.length} elements, ${allDocs.length} docs`,
  });
  console.log(`[guideV3] Complete: ${durationMs}ms — ${allFixed.length} fixed, ${allScoring.length} scoring, ${elemResult.elements.length} elements, ${allDocs.length} docs`);

  onProgress?.(95, `${allFixed.length} reguli, ${allScoring.length} criterii, ${elemResult.elements.length} elemente, ${allDocs.length} documente`);

  return {
    metadata,
    fixedRules: allFixed,
    scoringCriteria: allScoring,
    elementDefinitions: elemResult.elements,
    documentRequirements: allDocs,
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    durationMs,
    processingLog,
  };
}
