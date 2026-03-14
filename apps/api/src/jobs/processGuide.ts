import { Worker, Job } from "bullmq";
import { db } from "../db";
import { documents, rules, orgConfig, scoringCriteria, templateElements, elementRuleLinks, ruleReferenceLinks, guideReferenceTables, elementDefinitions } from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getFileBuffer } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX } from "../services/ocr";
import { logAIUsage } from "../services/aiUsage";
import { publishEvent, publishJobProgress } from "../lib/sse";
import { redis, isRedisReady } from "../lib/redis";
import { extractElementDefinitionsFromGuide, autoMapTemplatePlaceholders } from "../services/elementDefinitionService";
import { anthropic, withAILimit } from "../lib/anthropic";

/** Maximum pages per chunk when splitting large guides */
const PAGES_PER_CHUNK = 15;

/** Character threshold — guides under this use single-pass (no chunking) */
const SINGLE_PASS_CHAR_LIMIT = 80000;

/** Max concurrent AI calls per phase to avoid rate limits */
const MAX_PARALLEL_CHUNKS = 2;

// ─── SECTION DETECTION ───

/**
 * Identified section from guide text with its content and metadata.
 */
interface GuideSection {
  /** Section identifier for logging/SSE */
  id: string;
  /** Human-readable section title */
  title: string;
  /** Content type determines which AI model to use */
  contentType: "eligibilitate" | "intensitate" | "selectie" | "cheltuieli" | "documente" | "achizitii" | "general";
  /** The extracted text for this section */
  text: string;
  /** Page numbers covered by this section */
  pageRange: [number, number];
}

/**
 * Section detection patterns. Each pattern identifies a type of guide section
 * by matching chapter/section headers and keywords.
 */
const SECTION_PATTERNS: Array<{
  id: string;
  title: string;
  contentType: GuideSection["contentType"];
  /** Header patterns to match section titles (case-insensitive) */
  headerPatterns: RegExp[];
  /** Keyword density patterns — if many of these appear in a chunk, it's likely this section type */
  keywords: string[];
}> = [
  {
    id: "eligibilitate",
    title: "Eligibilitate",
    contentType: "eligibilitate",
    headerPatterns: [
      /(?:capitolul|cap\.?|sec[tț]iunea|articolul)\s*\d*[.:)]*\s*.*(?:eligibil|beneficiar)/i,
      /\d+[.\d]*\s+(?:beneficiari\s+eligibili|condi[tț]ii\s+(?:de\s+)?eligibilitate|criterii\s+(?:de\s+)?eligibilitate)/i,
      /(?:condi[tț]ii\s+obligatorii|cerin[tț]e\s+minime)/i,
    ],
    keywords: ["eligibil", "beneficiar", "forma juridic", "CAEN", "inregistr", "constituit", "vechime", "insolventa", "radiata", "dificultate"],
  },
  {
    id: "intensitate",
    title: "Intensitate sprijin",
    contentType: "intensitate",
    headerPatterns: [
      /\d+[.\d]*\s+(?:intensitatea|rata)\s+(?:sprijinului|ajutorului|finan[tț][aă]rii)/i,
      /(?:capitolul|cap\.?|sec[tț]iunea)\s*\d*[.:)]*\s*.*(?:intensitat|rata\s+ajutor)/i,
      /(?:cofinan[tț]are|contribu[tț]ie\s+proprie)/i,
    ],
    keywords: ["intensitate", "cofinantare", "nerambursabil", "contribu", "ajutor de stat", "de minimis", "micro", "intreprindere mica", "mijlocie", "mare"],
  },
  {
    id: "selectie",
    title: "Criterii selecție",
    contentType: "selectie",
    headerPatterns: [
      /\d+[.\d]*\s+(?:criterii(?:le)?\s+(?:de\s+)?selec[tț]ie|grila\s+(?:de\s+)?(?:punctaj|evaluare|selec[tț]ie))/i,
      /(?:capitolul|cap\.?|sec[tț]iunea)\s*\d*[.:)]*\s*.*(?:selec[tț]ie|punctaj|evaluare)/i,
    ],
    keywords: ["punctaj", "puncte", "criteriu", "selectie", "grila", "evaluare", "scor", "minim", "maxim", "pondere"],
  },
  {
    id: "cheltuieli",
    title: "Cheltuieli eligibile",
    contentType: "cheltuieli",
    headerPatterns: [
      /\d+[.\d]*\s+(?:cheltuieli(?:le)?\s+eligibil|categorii\s+(?:de\s+)?cheltuieli)/i,
      /(?:capitolul|cap\.?|sec[tț]iunea)\s*\d*[.:)]*\s*.*cheltuiel/i,
    ],
    keywords: ["cheltuieli eligibil", "cheltuieli neeligibil", "TVA", "flat rate", "cost real", "amortizare", "buget", "categori"],
  },
  {
    id: "documente",
    title: "Documente obligatorii",
    contentType: "documente",
    headerPatterns: [
      /\d+[.\d]*\s+(?:documente(?:le)?\s+(?:obligatorii|necesare)|lista\s+documentel)/i,
      /(?:capitolul|cap\.?|sec[tț]iunea)\s*\d*[.:)]*\s*.*(?:document|anexe?\s+obligatori)/i,
    ],
    keywords: ["document obligatoriu", "certificat", "copie conform", "original", "semnat", "termen valabilitate", "anexa"],
  },
  {
    id: "achizitii",
    title: "Achiziții",
    contentType: "achizitii",
    headerPatterns: [
      /\d+[.\d]*\s+(?:achizi[tț]ii|procedur[aă]\s+(?:de\s+)?achizi[tț]ie)/i,
      /(?:capitolul|cap\.?|sec[tț]iunea)\s*\d*[.:)]*\s*.*achizi[tț]/i,
    ],
    keywords: ["achizitie", "procedura simplificata", "licitatie", "SEAP", "SICAP", "oferta", "prag", "atribuire"],
  },
];

/**
 * Detect logical sections in guide text based on chapter headers and keyword density.
 * Falls back to page-based chunking if no sections are detected.
 */
function detectSections(text: string): GuideSection[] {
  const pageDelimiter = /--- Pagina (\d+) ---/g;
  const pageBreaks: Array<{ page: number; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pageDelimiter.exec(text)) !== null) {
    pageBreaks.push({ page: parseInt(match[1]), index: match.index });
  }

  if (pageBreaks.length < 3) {
    // Too few pages to detect sections — return as single section
    return [{ id: "full", title: "Ghid complet", contentType: "general", text, pageRange: [1, 1] }];
  }

  // Try to detect sections using header patterns
  const detectedSections: GuideSection[] = [];
  const assignedPages = new Set<number>();

  for (const pattern of SECTION_PATTERNS) {
    for (const headerPattern of pattern.headerPatterns) {
      const headerMatch = headerPattern.exec(text);
      if (!headerMatch) continue;

      // Find which page this header is on
      const matchIndex = headerMatch.index;
      let startPageIdx = 0;
      for (let i = 0; i < pageBreaks.length; i++) {
        if (pageBreaks[i].index <= matchIndex) {
          startPageIdx = i;
        } else {
          break;
        }
      }

      // Find the end: next detected section header or ~15 pages max
      let endPageIdx = Math.min(startPageIdx + PAGES_PER_CHUNK, pageBreaks.length - 1);

      // Look for the next section header to determine where this section ends
      for (const otherPattern of SECTION_PATTERNS) {
        if (otherPattern.id === pattern.id) continue;
        for (const otherHeader of otherPattern.headerPatterns) {
          const otherMatch = otherHeader.exec(text.slice(pageBreaks[startPageIdx + 1]?.index || 0));
          if (otherMatch) {
            const otherAbsIndex = (pageBreaks[startPageIdx + 1]?.index || 0) + otherMatch.index;
            for (let i = startPageIdx + 1; i < pageBreaks.length; i++) {
              if (pageBreaks[i].index >= otherAbsIndex) {
                endPageIdx = Math.min(endPageIdx, i - 1);
                break;
              }
            }
          }
        }
      }

      // Ensure we have at least 1 page
      endPageIdx = Math.max(endPageIdx, startPageIdx);

      // Check if these pages are already assigned
      let overlap = false;
      for (let p = pageBreaks[startPageIdx].page; p <= pageBreaks[endPageIdx].page; p++) {
        if (assignedPages.has(p)) { overlap = true; break; }
      }
      if (overlap) continue;

      // Extract the text for this section
      const startIdx = pageBreaks[startPageIdx].index;
      const endIdx = endPageIdx + 1 < pageBreaks.length
        ? pageBreaks[endPageIdx + 1].index
        : text.length;
      const sectionText = text.slice(startIdx, endIdx);

      // Verify keyword density — at least 3 keywords must appear
      const keywordMatches = pattern.keywords.filter(kw =>
        sectionText.toLowerCase().includes(kw.toLowerCase())
      ).length;
      if (keywordMatches < 3) continue;

      // Mark pages as assigned
      for (let p = pageBreaks[startPageIdx].page; p <= pageBreaks[endPageIdx].page; p++) {
        assignedPages.add(p);
      }

      detectedSections.push({
        id: pattern.id,
        title: pattern.title,
        contentType: pattern.contentType,
        text: sectionText,
        pageRange: [pageBreaks[startPageIdx].page, pageBreaks[endPageIdx].page],
      });

      break; // Only use first header match per pattern
    }
  }

  // If we detected at least 2 sections, use section-based processing
  if (detectedSections.length >= 2) {
    // Add remaining unassigned pages as "general" sections
    const unassignedRanges: Array<[number, number]> = [];
    let rangeStart = -1;

    for (let i = 0; i < pageBreaks.length; i++) {
      const page = pageBreaks[i].page;
      if (!assignedPages.has(page)) {
        if (rangeStart === -1) rangeStart = i;
      } else {
        if (rangeStart !== -1) {
          unassignedRanges.push([rangeStart, i - 1]);
          rangeStart = -1;
        }
      }
    }
    if (rangeStart !== -1) {
      unassignedRanges.push([rangeStart, pageBreaks.length - 1]);
    }

    // Group unassigned pages into chunks of PAGES_PER_CHUNK
    for (const [startIdx, endIdx] of unassignedRanges) {
      for (let i = startIdx; i <= endIdx; i += PAGES_PER_CHUNK) {
        const chunkEndIdx = Math.min(i + PAGES_PER_CHUNK - 1, endIdx);
        const startTextIdx = pageBreaks[i].index;
        const endTextIdx = chunkEndIdx + 1 < pageBreaks.length
          ? pageBreaks[chunkEndIdx + 1].index
          : text.length;

        detectedSections.push({
          id: `general_${pageBreaks[i].page}_${pageBreaks[chunkEndIdx].page}`,
          title: `Pagini ${pageBreaks[i].page}-${pageBreaks[chunkEndIdx].page}`,
          contentType: "general",
          text: text.slice(startTextIdx, endTextIdx),
          pageRange: [pageBreaks[i].page, pageBreaks[chunkEndIdx].page],
        });
      }
    }

    // Sort by page range
    detectedSections.sort((a, b) => a.pageRange[0] - b.pageRange[0]);

    console.log(`[processGuide] Detected ${detectedSections.length} sections: ${detectedSections.map(s => `${s.id}(p${s.pageRange[0]}-${s.pageRange[1]})`).join(", ")}`);
    return detectedSections;
  }

  // Fallback: no sections detected, use page-based chunking
  return fallbackToPageChunks(text, pageBreaks);
}

/** Fallback: split into page-based chunks when section detection fails */
function fallbackToPageChunks(text: string, pageBreaks: Array<{ page: number; index: number }>): GuideSection[] {
  const sections: GuideSection[] = [];

  for (let i = 0; i < pageBreaks.length; i += PAGES_PER_CHUNK) {
    const endIdx = Math.min(i + PAGES_PER_CHUNK - 1, pageBreaks.length - 1);
    const startTextIdx = pageBreaks[i].index;
    const endTextIdx = endIdx + 1 < pageBreaks.length
      ? pageBreaks[endIdx + 1].index
      : text.length;

    // Classify the chunk by keyword density
    const chunkText = text.slice(startTextIdx, endTextIdx);
    const contentType = classifyChunkByKeywords(chunkText);

    sections.push({
      id: `chunk_${pageBreaks[i].page}_${pageBreaks[endIdx].page}`,
      title: `Pagini ${pageBreaks[i].page}-${pageBreaks[endIdx].page}`,
      contentType,
      text: chunkText,
      pageRange: [pageBreaks[i].page, pageBreaks[endIdx].page],
    });
  }

  return sections;
}

/** Classify a text chunk by keyword density to determine its predominant content type */
function classifyChunkByKeywords(text: string): GuideSection["contentType"] {
  const lower = text.toLowerCase();
  const scores: Array<{ type: GuideSection["contentType"]; score: number }> = [];

  for (const pattern of SECTION_PATTERNS) {
    const score = pattern.keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
    scores.push({ type: pattern.contentType, score });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores[0]?.score >= 3 ? scores[0].type : "general";
}

/**
 * Select the optimal AI model for a section based on its content type.
 * Simple rule lists → Haiku (cheap, fast)
 * Scoring/moderate complexity → Sonnet
 * Complex interpretive rules → Opus + Extended Thinking
 */
function selectModelForSection(
  section: GuideSection,
  phase: "fixed" | "interpreted" | "scoring",
  defaults: { fixedModel: string; interpModel: string },
): { model: string; useET: boolean } {
  if (phase === "fixed") {
    switch (section.contentType) {
      case "documente":
      case "cheltuieli":
        // Simple lists — Haiku is sufficient
        return { model: "claude-haiku-4-5-20251001", useET: false };
      case "eligibilitate":
      case "achizitii":
        // Moderate complexity — use configured fixed model (default Sonnet)
        return { model: defaults.fixedModel, useET: false };
      default:
        return { model: defaults.fixedModel, useET: false };
    }
  }

  if (phase === "interpreted") {
    switch (section.contentType) {
      case "intensitate":
        // Complex decision trees — Opus + Extended Thinking
        return { model: defaults.interpModel, useET: true };
      case "selectie":
        // Scoring criteria with conditions — Sonnet is sufficient
        return { model: "claude-sonnet-4-20250514", useET: false };
      case "documente":
      case "cheltuieli":
        // Conditional lists — Haiku with careful prompting
        return { model: "claude-haiku-4-5-20251001", useET: false };
      default:
        return { model: defaults.interpModel, useET: true };
    }
  }

  // scoring phase
  switch (section.contentType) {
    case "selectie":
      // This IS the scoring section — use Sonnet
      return { model: "claude-sonnet-4-20250514", useET: false };
    default:
      // Other sections might also contain scoring info
      return { model: defaults.fixedModel, useET: false };
  }
}

// ─── LEGACY CHUNKING (kept for backward compatibility with single-pass) ───

/**
 * Split guide text into chunks of ~PAGES_PER_CHUNK pages.
 * Uses "--- Pagina N ---" delimiters produced by extractTextFromPDF.
 * Returns array of chunks. Small guides return a single chunk.
 */
function splitTextIntoChunks(text: string): string[] {
  // If text fits in a single pass, don't split
  if (text.length <= SINGLE_PASS_CHAR_LIMIT) {
    return [text];
  }

  const pageDelimiter = /--- Pagina \d+ ---/g;
  const parts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pageDelimiter.exec(text)) !== null) {
    parts.push(match.index);
  }

  // No page markers — return as-is
  if (parts.length <= 1) {
    return [text];
  }

  const chunks: string[] = [];
  for (let i = 0; i < parts.length; i += PAGES_PER_CHUNK) {
    const startIdx = parts[i];
    const endIdx = i + PAGES_PER_CHUNK < parts.length
      ? parts[i + PAGES_PER_CHUNK]
      : text.length;
    chunks.push(text.slice(startIdx, endIdx));
  }

  return chunks;
}

/**
 * Deduplicate rules by normalized description.
 * Keeps the rule with higher confidence when duplicates are found.
 */
function deduplicateRules(allRules: any[]): any[] {
  const seen = new Map<string, any>();
  for (const rule of allRules) {
    const key = (rule.description || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.,;:!?()"""'']/g, "")
      .trim();
    if (key.length < 10) continue;
    if (!seen.has(key)) {
      seen.set(key, rule);
    } else {
      const existing = seen.get(key);
      if ((rule.confidence || 0) > (existing.confidence || 0)) {
        seen.set(key, rule);
      }
    }
  }
  return Array.from(seen.values());
}

/** Cache guide text in Redis for reuse by Solomon/Neemia (TTL 30 days) */
async function cacheGuideText(documentId: string, text: string): Promise<void> {
  if (!isRedisReady()) return;
  try {
    await redis.set(`guide_text:${documentId}`, text, "EX", 30 * 86400); // 30 days TTL
  } catch (err) {
    console.warn("Failed to cache guide text:", err);
  }
}

/** Run async tasks in parallel with concurrency limit */
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = MAX_PARALLEL_CHUNKS,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

interface ProcessGuidePayload {
  documentId: string;
  organizationId: string;
}

const FIXED_RULES_SYSTEM = `Esti Solomon — expert in pregatirea si conformitatea proiectelor cu finantare europeana, cu cunostinte integrate de achizitii publice, eligibilitate cheltuieli, specificatii tehnice si cerinte documentare per program.

Analizezi ghiduri de finantare si extragi REGULI FIXE — conditii binare, verificabile automat cu date din certificat constatator, bilant sau alte surse oficiale.

REGULI FIXE = conditii cu raspuns DA/NU:
- Plafoane numerice (cifra afaceri min/max, angajati min, capital social min)
- Forme juridice eligibile/neeligibile
- Coduri CAEN eligibile (inclusiv conditia de autorizare la ONRC)
- Vechime minima firma (ani de la infiintare)
- Zone geografice eligibile (judete, UAT-uri, urban/rural)
- Dimensiune ferma (SO minim/maxim)
- Valoare investitie min/max
- Cofinantare minima (%)
- Restrictii stare firma (nu in insolventa, nu radiata, nu in dificultate)

ACHIZITII — cauta reguli fixe despre:
- Praguri valorice pentru proceduri de achizitie (achizitie directa / procedura simplificata / licitatie)
- Numar minim de oferte comparative obligatorii
- Obligativitate SEAP/SICAP peste anumite praguri
- Interdictii (ex: echipamente second-hand, leasing operational)

ELIGIBILITATE CHELTUIELI — cauta reguli fixe despre:
- Categorii de cheltuieli eligibile/neeligibile explicit mentionate
- Plafoane pe categorii (% din valoarea proiectului, sume absolute)
- TVA eligibil/neeligibil
- Cheltuieli indirecte (flat rate % sau cost real)
- Intensitatea ajutorului per dimensiune firma (micro/mica/mijlocie/mare)
- Durata minima de utilizare / pastrare a activelor achizitionate

DOCUMENTE OBLIGATORII — cauta reguli fixe despre:
- Lista documentelor obligatorii la depunere
- Formate impuse (original, copie, electronic)
- Termen de valabilitate documente (ex: certificat fiscal max 30 zile)
- Documente conditionate de tipul investitiei

Fii EXHAUSTIV — o regula omisa poate insemna un dosar respins.
Returneaza DOAR JSON valid — array de obiecte. Fara backticks, fara explicatii.`;

const FIXED_RULES_USER_PREFIX = `Extrage TOATE regulile fixe din acest ghid de finantare.

Pentru fiecare regula returneaza:
{
  "category": "eligibilitate" | "financiar" | "tehnic" | "administrativ" | "achizitii" | "documente",
  "description": "Descriere clara a regulii",
  "condition": {
    "field": "campul verificat (ex: cifra_afaceri, forma_juridica, cod_caen, angajati, vechime_ani)",
    "operator": "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "between",
    "value": "valoarea de comparare",
    "value2": "pentru between - limita superioara (optional)"
  },
  "source_page": number,
  "source_text": "textul exact din ghid care defineste regula",
  "confidence": 0.0 - 1.0
}

TEXT GHID:
`;

/** Extract fixed rules from a single section/chunk of text. Returns parsed rules (not saved to DB). */
async function extractFixedRulesFromChunk(
  chunkText: string,
  model: string,
  organizationId: string,
  chunkLabel: string,
): Promise<any[]> {
  const response = await withAILimit(() => anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: FIXED_RULES_SYSTEM,
    messages: [{
      role: "user",
      content: `${FIXED_RULES_USER_PREFIX}${chunkText}`,
    }],
  }));

  const content = response.content[0].type === "text" ? response.content[0].text : "[]";
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error(`Failed to parse fixed rules JSON (${chunkLabel})`);
    parsed = [];
  }

  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: `extract_fixed_rules_${chunkLabel}`,
  });

  return parsed;
}

/** Extract fixed rules — processes sections IN PARALLEL with smart model selection. */
async function extractFixedRules(
  sections: GuideSection[],
  defaultModel: string,
  interpModel: string,
  documentId: string,
  organizationId: string,
  onSectionDone?: (sectionId: string, sectionTitle: string, rulesCount: number) => void,
): Promise<void> {
  const allResults = await parallelMap(sections, async (section) => {
    const { model } = selectModelForSection(section, "fixed", { fixedModel: defaultModel, interpModel });
    const sectionRules = await extractFixedRulesFromChunk(
      section.text, model, organizationId, section.id,
    );
    onSectionDone?.(section.id, section.title, sectionRules.length);
    return sectionRules;
  });

  let allRules = allResults.flat();

  // Deduplicate
  if (sections.length > 1) {
    const before = allRules.length;
    allRules = deduplicateRules(allRules);
    if (before !== allRules.length) {
      console.log(`[processGuide] Fixed rules dedup: ${before} → ${allRules.length} (removed ${before - allRules.length} duplicates)`);
    }
  }

  if (allRules.length > 0) {
    await db.insert(rules).values(
      allRules.map((r: any) => ({
        documentId,
        organizationId,
        type: "fixed" as const,
        category: r.category || "eligibilitate",
        description: r.description,
        condition: r.condition,
        sourcePage: r.source_page,
        sourceText: r.source_text,
        confidence: r.confidence?.toString() || "0.90",
      }))
    );
  }
}

const INTERPRETED_RULES_SYSTEM = `Esti Solomon — expert in pregatirea si conformitatea proiectelor cu finantare europeana, cu cunostinte integrate de achizitii publice, eligibilitate cheltuieli, specificatii tehnice si cerinte documentare per program.

Analizezi ghiduri de finantare si extragi REGULI INTERPRETATE — reguli complexe care necesita arbori decizionali, judecata profesionala sau context suplimentar.

ACHIZITII — cauta reguli interpretate despre:
- Cand se aplica procedura simplificata vs licitatie (praguri cumulate, loturi)
- Criterii de atribuire complexe (pret + calitate, ponderi)
- Conflict de interese — definitii si situatii care necesita declaratii
- Specificatii tehnice care ar putea fi considerate restrictive
- Reguli de proportionalitate intre valoare achizitie si complexitate procedura

ELIGIBILITATE CHELTUIELI — cauta reguli interpretate despre:
- Cheltuieli eligibile conditionat (ex: "doar daca se justifica prin SF")
- Reguli de rezonabilitate a preturilor (studiu de piata, benchmarking)
- Cheltuieli cu personalul — conditii complexe (% din buget, categorii, nivel salarial)
- Reguli de amortizare si pro-rata temporis
- Dubla finantare — cum se verifica, ce constitue suprapunere

SELECTIE SI PUNCTAJ — cauta:
- Grile complete de evaluare cu punctaje si praguri minime
- Criterii cu subpuncte conditionate
- Bonificatii si penalizari

CERINTE DOCUMENTARE COMPLEXE — cauta:
- Documente necesare doar in anumite scenarii (tip investitie, locatie, dimensiune)
- Formate specifice organismului (AFIR, ADR, MIPE) cu codificari
- Termene de depunere / completare / clarificari
- Conditii de conformitate administrativa vs eligibilitate tehnica

Fii EXHAUSTIV — o regula ratata poate insemna un dosar respins.
Marcheaza cu needs_review: true regulile unde ai dubii.
Returneaza DOAR JSON valid — array de obiecte.`;

const INTERPRETED_RULES_USER_PREFIX = `Extrage REGULILE INTERPRETATE din acest ghid de finantare — reguli care necesita judecata, arbori decizionali, sau context suplimentar.

REGULI INTERPRETATE = conditii complexe:
- Intensitatea sprijinului (% finantare nerambursabila) bazata pe mai multi factori
- Criterii de selectie cu punctaje (grile de punctare)
- Conditii cumulative (trebuie indeplinite toate din lista)
- Exceptii si cazuri speciale
- Definitii interpretabile (ex: "exploatatie agricola viabila", "intreprindere in dificultate")
- Cerinte documentare conditionate (documentul X e necesar doar daca...)
- Restrictii temporale complexe (ex: "in ultimii 3 ani fiscali")
- Reguli de achizitii conditionate de valoare, tip beneficiar sau tip cheltuiala
- Cheltuieli eligibile conditionat (doar cu justificare, doar pana la un plafon calculat)
- Reguli privind ajutorul de stat / de minimis — cumul, verificare, declaratii

Pentru fiecare regula returneaza:
{
  "category": "selectie" | "intensitate" | "eligibilitate_complexa" | "documentare" | "achizitii" | "ajutor_stat",
  "description": "Descriere detaliata",
  "condition": {
    "type": "decision_tree" | "scoring" | "cumulative" | "conditional",
    "logic": "descriere structurata a logicii decizionale",
    "factors": ["factor1", "factor2"],
    "outcomes": [{"if": "conditie", "then": "rezultat"}]
  },
  "source_page": number,
  "source_text": "textul exact din ghid",
  "confidence": 0.0 - 1.0,
  "needs_review": true/false,
  "review_reason": "de ce necesita verificare umana"
}

TEXT GHID:
`;

/** Extract interpreted rules from a single section/chunk. Returns parsed rules (not saved to DB). */
async function extractInterpretedRulesFromChunk(
  chunkText: string,
  model: string,
  useET: boolean,
  organizationId: string,
  chunkLabel: string,
): Promise<any[]> {
  const requestParams: any = {
    model,
    max_tokens: 12000,
    system: INTERPRETED_RULES_SYSTEM,
    messages: [{
      role: "user",
      content: `${INTERPRETED_RULES_USER_PREFIX}${chunkText}`,
    }],
  };

  if (useET) {
    requestParams.thinking = {
      type: "enabled",
      budget_tokens: 10000,
    };
  }

  const response = await withAILimit(() => anthropic.messages.create(requestParams));

  const textBlock = response.content.find((b: any) => b.type === "text");
  const content = textBlock ? (textBlock as any).text : "[]";
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error(`Failed to parse interpreted rules JSON (${chunkLabel})`);
    parsed = [];
  }

  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: `extract_interpreted_rules_${chunkLabel}`,
  });

  return parsed;
}

/** Extract interpreted rules — processes sections IN PARALLEL with smart model selection. */
async function extractInterpretedRules(
  sections: GuideSection[],
  defaultInterpModel: string,
  defaultUseET: boolean,
  fixedModel: string,
  documentId: string,
  organizationId: string,
  onSectionDone?: (sectionId: string, sectionTitle: string, rulesCount: number) => void,
): Promise<void> {
  const allResults = await parallelMap(sections, async (section) => {
    const { model, useET } = selectModelForSection(section, "interpreted", { fixedModel, interpModel: defaultInterpModel });
    // Only use ET if the section warrants it AND it's enabled in config
    const effectiveET = useET && defaultUseET;
    const sectionRules = await extractInterpretedRulesFromChunk(
      section.text, model, effectiveET, organizationId, section.id,
    );
    onSectionDone?.(section.id, section.title, sectionRules.length);
    return sectionRules;
  });

  let allRules = allResults.flat();

  // Deduplicate
  if (sections.length > 1) {
    const before = allRules.length;
    allRules = deduplicateRules(allRules);
    if (before !== allRules.length) {
      console.log(`[processGuide] Interpreted rules dedup: ${before} → ${allRules.length} (removed ${before - allRules.length} duplicates)`);
    }
  }

  if (allRules.length > 0) {
    await db.insert(rules).values(
      allRules.map((r: any) => ({
        documentId,
        organizationId,
        type: "interpreted" as const,
        category: r.category || "selectie",
        description: r.description,
        condition: r.condition,
        sourcePage: r.source_page,
        sourceText: r.source_text,
        confidence: r.confidence?.toString() || "0.75",
        validated: false,
      }))
    );
  }
}

const SCORING_SYSTEM = `Esti Solomon — expert in finantari europene.

Extragi GRILA DE PUNCTAJ / CRITERII DE SELECTIE din ghiduri de finantare.
Acestea sunt criteriile prin care se IERARHIZEAZA / PUNCTEAZA proiectele depuse.

Fiecare criteriu are:
- Un cod/numar (ex: CS1, C1, 1.1)
- Un nume descriptiv
- Punctaj maxim
- O modalitate de evaluare: lookup (tabel), range (interval numeric), boolean (da/nu), formula

IMPORTANT:
- Extrage TOATE criteriile din grila de punctaj/selectie
- Pentru fiecare criteriu, identifica tipul de evaluare si structura logicii
- Daca criteriul se evalueaza pe baza unui tabel (ex: "conform Anexa X"), tipul este "lookup"
- Daca criteriul depinde de un interval numeric (ex: "1-5 angajati = 10p, 6-10 = 20p"), tipul este "range"
- Daca criteriul este da/nu, tipul este "boolean"
- Daca criteriul necesita o formula de calcul, tipul este "formula"
- Identifica cheia elementului (field/camp) pe care se bazeaza evaluarea

Returneaza DOAR JSON valid — array de obiecte. Fara backticks, fara explicatii.`;

const SCORING_USER_PREFIX = `Extrage grila de punctaj / criteriile de selectie din acest ghid.

Pentru fiecare criteriu returneaza:
{
  "code": "codul criteriului (ex: CS1, C1, 1.1)",
  "name": "numele criteriului",
  "description": "descriere detaliata a criteriului si cum se acorda punctele",
  "maxPoints": number,
  "category": "categoria (ex: tehnic, financiar, management, relevant, sustenabilitate)",
  "sourcePage": number | null,
  "evaluationLogic": {
    "type": "lookup" | "range" | "boolean" | "formula",
    "elementKey": "cheia campului de evaluat (ex: numar_angajati, cifra_afaceri, experienta_ani)",
    "ranges": [{"min": number, "max": number, "points": number}] // doar pt type=range
    "formula": "expresie matematica cu {element_key}" // doar pt type=formula
    "lookupColumn": "coloana punctaj din tabel" // doar pt type=lookup
  }
}

Daca nu gasesti nicio grila de punctaj, returneaza un array gol [].

TEXT GHID:
`;

/** Extract scoring criteria from a single section/chunk. Returns parsed criteria (not saved to DB). */
async function extractScoringFromChunk(
  chunkText: string,
  model: string,
  organizationId: string,
  chunkLabel: string,
): Promise<any[]> {
  const response = await withAILimit(() => anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: SCORING_SYSTEM,
    messages: [{
      role: "user",
      content: `${SCORING_USER_PREFIX}${chunkText}`,
    }],
  }));

  const content = response.content[0].type === "text" ? response.content[0].text : "[]";
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error(`Failed to parse scoring criteria JSON (${chunkLabel})`);
    parsed = [];
  }

  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: `extract_scoring_criteria_${chunkLabel}`,
  });

  return parsed;
}

/** Phase 3: Extract scoring grid — processes sections IN PARALLEL. */
async function extractScoringCriteria(
  sections: GuideSection[],
  defaultModel: string,
  interpModel: string,
  documentId: string,
  organizationId: string,
  onSectionDone?: (sectionId: string, sectionTitle: string, criteriaCount: number) => void,
): Promise<void> {
  const allResults = await parallelMap(sections, async (section) => {
    const { model } = selectModelForSection(section, "scoring", { fixedModel: defaultModel, interpModel });
    const sectionCriteria = await extractScoringFromChunk(
      section.text, model, organizationId, section.id,
    );
    onSectionDone?.(section.id, section.title, sectionCriteria.length);
    return sectionCriteria;
  });

  let allCriteria = allResults.flat();

  // Deduplicate scoring criteria by code
  if (sections.length > 1) {
    const seen = new Map<string, any>();
    for (const c of allCriteria) {
      const code = (c.code || "").toLowerCase().trim();
      if (!seen.has(code)) {
        seen.set(code, c);
      }
    }
    const before = allCriteria.length;
    allCriteria = Array.from(seen.values());
    if (before !== allCriteria.length) {
      console.log(`[processGuide] Scoring criteria dedup: ${before} → ${allCriteria.length}`);
    }
  }

  if (allCriteria.length > 0) {
    await db.delete(scoringCriteria).where(eq(scoringCriteria.documentId, documentId));

    await db.insert(scoringCriteria).values(
      allCriteria.map((c: any, idx: number) => ({
        documentId,
        organizationId,
        code: c.code || `CS${idx + 1}`,
        name: c.name || "Criteriu neprecizat",
        description: c.description || null,
        maxPoints: String(c.maxPoints || 0),
        evaluationLogic: c.evaluationLogic || null,
        category: c.category || null,
        sortOrder: idx,
        sourcePage: c.sourcePage || null,
      }))
    );
  }
}

/**
 * Phase 4: Auto-link extracted rules to templateElements and guideReferenceTables.
 *
 * For elementRuleLinks:
 *   - Fixed rules with condition.field → match templateElements by key
 *   - All rules → fuzzy match by description keywords against element keys/labels
 *
 * For ruleReferenceLinks:
 *   - Rules whose sourceText mentions table names → link to matching guideReferenceTables
 *   - Scoring criteria with evaluationLogic.type="lookup" → link to reference tables
 */
async function autoLinkRulesAndReferences(
  documentId: string,
  organizationId: string,
): Promise<{ elementLinks: number; referenceLinks: number }> {
  let elementLinksCreated = 0;
  let referenceLinksCreated = 0;

  // Load all rules for this document
  const docRules = await db.query.rules.findMany({
    where: eq(rules.documentId, documentId),
  });

  // Load all template elements for this organization
  const orgTemplateElements = await db.query.templateElements.findMany({
    where: eq(templateElements.organizationId, organizationId),
  });

  // Load all reference tables for this organization
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
    // Also index by label (normalized)
    const labelKey = el.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (labelKey && !elementsByKey.has(labelKey)) {
      elementsByKey.set(labelKey, el);
    }
  }

  // Common field name aliases to match condition.field → element key
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

  // Reverse alias map: alias → canonical field
  const aliasToField = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(fieldAliases)) {
    for (const alias of aliases) {
      aliasToField.set(alias, canonical);
    }
  }

  // Track existing links to avoid duplicates
  const existingElemLinks = new Set<string>();
  const existingRefLinks = new Set<string>();

  for (const rule of docRules) {
    const condition = rule.condition as any;

    // --- ELEMENT LINKS ---
    // 1. Direct match via condition.field
    if (condition?.field) {
      const fieldName = String(condition.field).toLowerCase();
      const fieldsToCheck = [fieldName];

      // Add aliases
      const canonical = aliasToField.get(fieldName);
      if (canonical) {
        const aliases = fieldAliases[canonical] || [];
        fieldsToCheck.push(...aliases);
      }

      for (const f of fieldsToCheck) {
        const matchedElement = elementsByKey.get(f);
        if (matchedElement) {
          const linkKey = `${matchedElement.id}:${rule.id}`;
          if (!existingElemLinks.has(linkKey)) {
            existingElemLinks.add(linkKey);
            try {
              await db.insert(elementRuleLinks).values({
                templateElementId: matchedElement.id,
                ruleId: rule.id,
                role: "constraint",
                description: `Auto-linked: rule condition.field "${condition.field}" → element "${matchedElement.key}"`,
              });
              elementLinksCreated++;
            } catch (err: any) {
              // Ignore duplicate constraint violations
              if (!err?.message?.includes("duplicate") && !err?.message?.includes("unique")) {
                console.warn(`[autoLink] Failed to create element-rule link:`, err?.message);
              }
            }
          }
          break; // Only link to first matching element
        }
      }
    }

    // 2. Match via scoring criteria elementKey
    if (condition?.type === "scoring" || condition?.elementKey) {
      const elementKey = (condition.elementKey || "").toLowerCase();
      if (elementKey) {
        const matchedElement = elementsByKey.get(elementKey);
        if (matchedElement) {
          const linkKey = `${matchedElement.id}:${rule.id}`;
          if (!existingElemLinks.has(linkKey)) {
            existingElemLinks.add(linkKey);
            try {
              await db.insert(elementRuleLinks).values({
                templateElementId: matchedElement.id,
                ruleId: rule.id,
                role: "input",
                description: `Auto-linked: scoring elementKey "${condition.elementKey}" → element "${matchedElement.key}"`,
              });
              elementLinksCreated++;
            } catch (err: any) {
              if (!err?.message?.includes("duplicate") && !err?.message?.includes("unique")) {
                console.warn(`[autoLink] Failed to create element-rule link:`, err?.message);
              }
            }
          }
        }
      }
    }

    // --- REFERENCE TABLE LINKS ---
    // Match rules whose sourceText mentions table names or "Anexa"
    const ruleText = `${rule.description || ""} ${rule.sourceText || ""}`.toLowerCase();

    for (const refTable of orgRefTables) {
      const tableName = (refTable.name || "").toLowerCase();
      if (!tableName || tableName.length < 5) continue;

      // Check if rule text mentions the table name
      const tableNameWords = tableName.split(/[\s\-_,]+/).filter(w => w.length > 3);
      const matchScore = tableNameWords.filter(w => ruleText.includes(w)).length;

      // Require at least 2 significant words to match, or exact table name
      if (ruleText.includes(tableName) || (tableNameWords.length >= 2 && matchScore >= 2)) {
        const linkKey = `${rule.id}:${refTable.id}`;
        if (!existingRefLinks.has(linkKey)) {
          existingRefLinks.add(linkKey);

          // Determine usage based on rule type
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

    // Link scoring criteria elementKey to template elements
    if (evalLogic.elementKey) {
      const elementKey = String(evalLogic.elementKey).toLowerCase();
      const matchedElement = elementsByKey.get(elementKey);
      if (matchedElement) {
        // Find the rule that corresponds to this scoring criterion (by code match in description)
        const matchingRule = docRules.find(r =>
          r.description?.includes(sc.code) || r.description?.includes(sc.name)
        );
        if (matchingRule) {
          const linkKey = `${matchedElement.id}:${matchingRule.id}`;
          if (!existingElemLinks.has(linkKey)) {
            existingElemLinks.add(linkKey);
            try {
              await db.insert(elementRuleLinks).values({
                templateElementId: matchedElement.id,
                ruleId: matchingRule.id,
                role: "input",
                description: `Auto-linked: scoring ${sc.code} elementKey "${evalLogic.elementKey}"`,
              });
              elementLinksCreated++;
            } catch (err: any) {
              if (!err?.message?.includes("duplicate") && !err?.message?.includes("unique")) {
                console.warn(`[autoLink] Failed to create scoring element link:`, err?.message);
              }
            }
          }
        }
      }
    }

    // Link lookup-type scoring criteria to reference tables
    if (evalLogic.type === "lookup" && evalLogic.lookupColumn) {
      for (const refTable of orgRefTables) {
        const schema = refTable.schema as Array<{ key: string; label: string }> | null;
        if (!schema) continue;
        // Check if the reference table has the lookup column
        const hasColumn = schema.some(col =>
          col.key === evalLogic.lookupColumn || col.label === evalLogic.lookupColumn
        );
        if (hasColumn) {
          // Find matching rule for this scoring criterion
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

export const processGuideWorker = new Worker<ProcessGuidePayload>(
  "process-guide",
  async (job: Job<ProcessGuidePayload>) => {
    const { documentId, organizationId } = job.data;
    const startTime = Date.now();

    try {
      await db.update(documents).set({ status: "processing", processingError: null }).where(eq(documents.id, documentId));

      const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
      if (!doc) throw new Error("Document not found");

      const { buffer, name: fileName } = await getFileBuffer(doc.fileId);

      // ─── STEP 1: Text extraction (PyMuPDF, zero AI, < 1 second) ───
      const extractStart = Date.now();
      let text = "";
      if (doc.fileType === "pdf") {
        text = await extractTextFromPDF(buffer);
      } else if (doc.fileType === "docx" || doc.fileType === "doc") {
        text = await extractTextFromDOCX(buffer, fileName);
      } else if (doc.fileType === "xlsx") {
        text = await extractTextFromXLSX(buffer, fileName);
      } else {
        throw new Error(`Format nesuportat pentru ghid: ${doc.fileType}`);
      }
      const extractDuration = Date.now() - extractStart;
      console.log(`[processGuide] Text extraction: ${extractDuration}ms for "${doc.name}"`);

      // Cache guide text in Redis for reuse by Solomon/Neemia
      cacheGuideText(documentId, text).catch(() => {});

      // ─── STEP 2: Section detection (zero AI, < 100ms) ───
      const sections = text.length <= SINGLE_PASS_CHAR_LIMIT
        ? [{ id: "full", title: "Ghid complet", contentType: "general" as const, text, pageRange: [1, 1] as [number, number] }]
        : detectSections(text);

      const config = await db.query.orgConfig.findFirst({
        where: eq(orgConfig.organizationId, organizationId),
      });

      const fixedModel = config?.reguliFixeModel || "claude-sonnet-4-20250514";
      const interpModel = config?.reguliInterpModel || "claude-opus-4-6";
      const useET = config?.reguliInterpET ?? true;

      const sectionSummary = sections.map(s => s.id).join(", ");
      console.log(`[processGuide] Processing "${doc.name}" with ${sections.length} sections: ${sectionSummary}`);

      // ─── STEP 3: Extract rules — Phases 1-3 IN PARALLEL ───
      // Fixed rules, interpreted rules, and scoring criteria are independent
      // (they read the same text but write to different tables).
      await job.updateProgress(10);
      publishJobProgress(organizationId, {
        jobId: job.id || "",
        jobType: "ghid",
        documentId,
        documentName: doc.name,
        progress: 10,
        status: "processing",
        message: `Extragere reguli din "${doc.name}" (${sections.length} secțiuni, procesare paralelă)...`,
      }).catch(() => {});

      const phaseStart = Date.now();
      let fixedRulesSections = 0;
      let interpRulesSections = 0;
      let scoringSections = 0;

      await Promise.all([
        // Phase 1: Fixed rules (all sections in parallel)
        extractFixedRules(sections, fixedModel, interpModel, documentId, organizationId, (sectionId, sectionTitle, rulesCount) => {
          fixedRulesSections++;
          const phaseProgress = 10 + Math.round((fixedRulesSections / sections.length) * 25);
          publishJobProgress(organizationId, {
            jobId: job.id || "",
            jobType: "ghid",
            documentId,
            documentName: doc.name,
            progress: phaseProgress,
            status: "processing",
            message: `Reguli fixe: secțiunea "${sectionTitle}" — ${rulesCount} reguli extrase`,
          }).catch(() => {});
          // SSE per section
          publishEvent(`org:${organizationId}:uploads`, "guide_section_processed", {
            documentId,
            section: sectionTitle,
            phase: "fixed_rules",
            rulesCount,
          }).catch(() => {});
        }),

        // Phase 2: Interpreted rules (all sections in parallel)
        extractInterpretedRules(sections, interpModel, useET, fixedModel, documentId, organizationId, (sectionId, sectionTitle, rulesCount) => {
          interpRulesSections++;
          const phaseProgress = 35 + Math.round((interpRulesSections / sections.length) * 35);
          publishJobProgress(organizationId, {
            jobId: job.id || "",
            jobType: "ghid",
            documentId,
            documentName: doc.name,
            progress: phaseProgress,
            status: "processing",
            message: `Reguli interpretate: secțiunea "${sectionTitle}" — ${rulesCount} reguli extrase`,
          }).catch(() => {});
          publishEvent(`org:${organizationId}:uploads`, "guide_section_processed", {
            documentId,
            section: sectionTitle,
            phase: "interpreted_rules",
            rulesCount,
          }).catch(() => {});
        }),

        // Phase 3: Scoring criteria (all sections in parallel)
        extractScoringCriteria(sections, fixedModel, interpModel, documentId, organizationId, (sectionId, sectionTitle, criteriaCount) => {
          scoringSections++;
          const phaseProgress = 70 + Math.round((scoringSections / sections.length) * 20);
          publishJobProgress(organizationId, {
            jobId: job.id || "",
            jobType: "ghid",
            documentId,
            documentName: doc.name,
            progress: phaseProgress,
            status: "processing",
            message: `Grilă punctaj: secțiunea "${sectionTitle}" — ${criteriaCount} criterii extrase`,
          }).catch(() => {});
          publishEvent(`org:${organizationId}:uploads`, "guide_section_processed", {
            documentId,
            section: sectionTitle,
            phase: "scoring_criteria",
            rulesCount: criteriaCount,
          }).catch(() => {});
        }),
      ]);

      const phaseDuration = Date.now() - phaseStart;
      console.log(`[processGuide] Phases 1-3 (parallel): ${phaseDuration}ms for "${doc.name}"`);

      // Phase 4: Auto-link rules to template elements and reference tables (progress 90-95)
      await job.updateProgress(90);
      publishJobProgress(organizationId, {
        jobId: job.id || "",
        jobType: "ghid",
        documentId,
        documentName: doc.name,
        progress: 90,
        status: "processing",
        message: `Creare link-uri reguli ↔ elemente din "${doc.name}"...`,
      }).catch(() => {});
      const linkResult = await autoLinkRulesAndReferences(documentId, organizationId);

      // Phase 5: Extract element definitions from guide (progress 95-98)
      await job.updateProgress(95);
      publishJobProgress(organizationId, {
        jobId: job.id || "",
        jobType: "ghid",
        documentId,
        documentName: doc.name,
        progress: 95,
        status: "processing",
        message: `Extragere definiții elemente din "${doc.name}"...`,
      }).catch(() => {});
      const elementDefsCount = await extractElementDefinitionsFromGuide(text, documentId, organizationId);

      // Phase 6: Auto-map existing template placeholders to element_definitions (progress 98-99)
      let templateMappings = 0;
      if (elementDefsCount > 0) {
        // Find template documents in this organization and auto-map their placeholders
        const templateDocs = await db.query.documents.findMany({
          where: and(
            eq(documents.organizationId, organizationId),
            inArray(documents.documentTypeClass, [
              "memoriu_template", "cerere_finantare_template",
              "anexa_b_template", "anexa_c_template",
            ]),
          ),
        });
        for (const tDoc of templateDocs) {
          templateMappings += await autoMapTemplatePlaceholders(tDoc.id, organizationId);
        }
      }

      const pageCount = (text.match(/--- Pagina/g) || []).length;
      const totalDuration = Date.now() - startTime;

      await db.update(documents).set({
        status: "processed",
        pageCount,
        processedAt: new Date(),
      }).where(eq(documents.id, documentId));

      await job.updateProgress(100);

      console.log(`[processGuide] Total: ${totalDuration}ms (extract: ${extractDuration}ms, AI phases: ${phaseDuration}ms) for "${doc.name}" (${pageCount} pages, ${sections.length} sections)`);

      // SSE notification
      publishEvent(`org:${organizationId}:uploads`, "document_processed", {
        documentId,
        documentName: doc.name,
        status: "processed",
        processingType: "ghid",
        pageCount,
        sectionCount: sections.length,
        elementLinks: linkResult.elementLinks,
        referenceLinks: linkResult.referenceLinks,
        elementDefinitions: elementDefsCount,
        templateMappings,
        totalDurationMs: totalDuration,
        message: `Ghid procesat "${doc.name}". ${pageCount} pagini, ${sections.length} secțiuni, reguli extrase paralel. ${linkResult.elementLinks + linkResult.referenceLinks} link-uri create. ${elementDefsCount} definiții elemente. ${templateMappings} mapări template. Timp total: ${(totalDuration / 1000).toFixed(1)}s.`,
      }).catch(() => {});
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
          ? `Eroare la procesarea ghidului (toate ${job.opts.attempts || 3} încercări eșuate): ${errorMsg}`
          : `Eroare la procesarea ghidului (încercare ${job.attemptsMade + 1}/${job.opts.attempts || 3}, se reîncearcă): ${errorMsg}`,
      }).catch(() => {});
      throw error;
    }
  },
  { connection: redis as any }
);
