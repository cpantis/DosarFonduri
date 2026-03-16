/**
 * ONRC Company Data Extractor
 *
 * STRATEGY: Local first, AI fallback.
 * 1. Native PDF → PyMuPDF text → regex parser (free, <100ms)
 * 2. Scanned PDF → Claude Sonnet parse (AI fallback)
 */
import { anthropic, withAILimit } from "../lib/anthropic";
import { parseOnrcText } from "./onrcParser";

export interface ExtractedCompanyData {
  denumire: string;
  cui: string;
  regCom: string;
  euid?: string;
  formaJuridica: string;
  formaJuridicaCod?: string;
  adresa: string;
  localitate: string;
  judet: string;
  telefon?: string;
  email?: string;
  stare: string;
  durata: string;
  anInfiintare: number;
  capitalSocial?: number;
  moneda?: string;
  partiSociale?: number;
  naturaCapital?: { privatAutohton: number; privatStrain: number; stat: number };
  asociati: Array<{
    type: "pf" | "pj";
    name: string;
    role: string;
    citizenship?: string;
    contribution?: number;
    shares?: number;
    pctBenefits?: number;
    pctLosses?: number;
    /** Extra fields from ONRC 2022+ format */
    dataNasterii?: string;
    locNastere?: string;
    sex?: string;
    stareCivila?: string;
    aportVarsatTotal?: number;
    cuiPJ?: string;
    regComPJ?: string;
  }>;
  administratori: Array<{
    name: string;
    role: string;
    powers?: string;
    mandateDuration?: string;
    /** Extra fields from ONRC 2022+ format */
    appointmentDate?: string;
    expiryDate?: string;
    citizenship?: string;
    dataNasterii?: string;
    sex?: string;
  }>;
  financials: Array<{
    year: number;
    cifraAfaceri: number;
    profitBrut: number;
    profitNet: number;
    angajati: number;
    angajatiEfectiv?: number;
    capitaluriProprii?: number;
    activeImobilizate?: number;
    activeCirculante?: number;
  }>;
  caenPrincipal?: string;
  caenDesc?: string;
  activitatiSecundare?: Array<{ cod: string; den: string }>;
  sediiSecundare?: Array<{ denumire: string; adresa: string }>;
  /** Extra metadata from ONRC */
  sediuSocial?: { actSediu?: string; durataSediu?: string };
}

// ─── Claude prompt (used ONLY for scanned PDFs as fallback) ───

const COMPANY_SYSTEM_PROMPT = `Ești expert în documente juridice românești. Primești textul unui PDF care poate conține MULTIPLE documente:
- Certificat de înregistrare
- Certificat de înregistrare în scopuri de TVA
- Certificat de mențiuni
- Rezoluție ORC
- Act constitutiv
- CERTIFICAT CONSTATATOR ONRC (cel mai important!)

SARCINA TA:
1. Identifică secțiunea "CERTIFICAT CONSTATATOR" din text
2. Extrage TOATE datele structurate din certificatul constatator
3. Dacă nu găsești certificat constatator, extrage ce poți din celelalte documente

RETURNEAZĂ DOAR JSON valid, fără backticks, fără explicații.

MAPARE FORME JURIDICE (text → cod):
- "Societate cu Raspundere Limitata" / "S.R.L." → "SRL"
- "Societate pe Actiuni" / "S.A." → "SA"
- "Persoana Fizica Autorizata" / "P.F.A." → "PFA"
- "Intreprindere Individuala" / "I.I." → "II"
- "Intreprindere Familiala" / "I.F." → "IF"

STARE FIRMĂ:
- "funcțiune" → "functiune"
- "radiată" / "dizolvată" → "radiata"`;

const COMPANY_USER_PROMPT = (pdfText: string) => `Extrage datele firmei din acest document PDF.

Returnează JSON cu structura:
{
  "denumire": "NUMELE FIRMEI",
  "cui": "1234567",
  "regCom": "J20/333/1992",
  "formaJuridica": "SRL",
  "adresa": "Str. X, Nr. Y",
  "localitate": "Orașul",
  "judet": "Județul",
  "stare": "functiune",
  "durata": "nelimitată",
  "anInfiintare": 1992,
  "capitalSocial": 1500,
  "moneda": "LEI",
  "partiSociale": 150,
  "asociati": [
    { "type": "pf", "name": "NUME PRENUME", "role": "asociat unic", "citizenship": "română", "contribution": 1500, "shares": 150, "pctBenefits": 100, "pctLosses": 100 }
  ],
  "administratori": [
    { "name": "NUME PRENUME", "role": "administrator", "powers": "DEPLINE", "mandateDuration": "Nelimitat" }
  ],
  "financials": [
    { "year": 2023, "cifraAfaceri": 33883844, "profitBrut": 6567414, "profitNet": 5294485, "angajati": 124, "capitaluriProprii": 27376475 }
  ],
  "caenPrincipal": "0220",
  "caenDesc": "Exploatare forestieră",
  "activitatiSecundare": [
    { "cod": "0111", "den": "Cultivarea cerealelor" }
  ]
}

TEXT DOCUMENT:
${pdfText.slice(0, 80000)}`;

/**
 * Try to extract valid JSON from a raw AI response text.
 * Uses shared safeJSONParse for truncation repair.
 */
function tryParseJSON(raw: string): any | null {
  // Import dynamically to avoid circular deps
  const { safeJSONParse } = require("../lib/safeExtract");
  const result = safeJSONParse(raw, "companyExtractor");
  return result?.data ?? null;
}

/**
 * Extract company data from ONRC PDF text.
 *
 * Strategy:
 * 1. Try regex parser first (free, instant) — works for native PDFs
 * 2. If regex fails or returns insufficient data, AND the text came from OCR
 *    (scanned PDF), fall back to Claude Sonnet for structured extraction
 *
 * @param pdfText - Extracted text from PDF (native or OCR)
 * @param hasScannedPages - Whether any pages required OCR (indicates scanned PDF)
 */
export async function extractCompanyFromDocument(
  pdfText: string,
  hasScannedPages: boolean = false,
): Promise<ExtractedCompanyData | null> {
  // ─── Step 1: Try regex parser (always, free) ───
  const regexResult = parseOnrcText(pdfText);

  if (regexResult) {
    // Check if we got enough data
    const hasCui = !!regexResult.cui;
    const hasDenumire = !!regexResult.denumire;
    const hasRegCom = !!regexResult.regCom;
    const fieldCount = Object.entries(regexResult)
      .filter(([_, v]) => v !== undefined && v !== "" && v !== 0 && (!Array.isArray(v) || v.length > 0))
      .length;

    if ((hasCui || hasDenumire) && fieldCount >= 5) {
      console.log(`[companyExtractor] Regex parser succeeded: CUI=${regexResult.cui}, denumire="${regexResult.denumire}", ${fieldCount} fields`);
      return regexResult;
    }

    // Partial regex result — if native PDF, return what we have
    if (!hasScannedPages && (hasCui || hasDenumire || hasRegCom)) {
      console.log(`[companyExtractor] Regex parser partial (native PDF): ${fieldCount} fields, returning as-is`);
      return regexResult;
    }

    console.warn(`[companyExtractor] Regex parser insufficient: ${fieldCount} fields. hasScannedPages=${hasScannedPages}`);
  }

  // ─── Step 2: AI fallback ───
  // For scanned PDFs: always try AI (OCR text is unreliable for regex)
  // For native PDFs: try AI only if regex failed completely (text exists but format unrecognized)
  if (!hasScannedPages && regexResult) {
    // Native PDF with partial regex — return what we have (no AI cost)
    console.warn(`[companyExtractor] Native PDF, regex partial — returning partial data`);
    return regexResult;
  }

  // AI fallback: scanned PDF OR native PDF where regex failed completely
  const reason = hasScannedPages ? "scanned PDF" : "native PDF, regex failed completely";
  console.log(`[companyExtractor] ${reason} — falling back to Claude Sonnet. Text sample: "${pdfText.slice(0, 200)}"`);
  return await extractWithClaude(pdfText);
}

/**
 * Claude Sonnet extraction — used ONLY for scanned PDFs.
 */
async function extractWithClaude(pdfText: string): Promise<ExtractedCompanyData | null> {
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 1;

    try {
      const response = await withAILimit(() => anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system: isRetry
          ? COMPANY_SYSTEM_PROMPT + "\n\nATENȚIE: Răspunsul tău anterior NU a fost JSON valid. Returnează EXCLUSIV un obiect JSON valid. Nimic altceva."
          : COMPANY_SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: COMPANY_USER_PROMPT(pdfText),
        }],
      }));

      const textBlock = response.content.find((b: any) => b.type === "text");
      const responseText = textBlock ? (textBlock as any).text : "";
      const data = tryParseJSON(responseText);

      if (data) {
        if (!data.cui && !data.denumire) {
          console.warn(
            `[companyExtractor] Claude attempt ${attempt}: JSON valid but no cui/denumire. Keys: [${Object.keys(data).join(", ")}]`,
          );
          if (attempt < MAX_ATTEMPTS) continue;
          return Object.keys(data).length > 2 ? data : null;
        }
        console.log(`[companyExtractor] Claude extraction succeeded: CUI=${data.cui}, denumire="${data.denumire}"`);
        return data;
      }

      console.error(
        `[companyExtractor] Claude attempt ${attempt}/${MAX_ATTEMPTS}: JSON parse failed. ` +
        `Response length: ${responseText.length}, first 300 chars: "${responseText.slice(0, 300)}"` +
        `\nHint: AI returned non-JSON response. This usually means the document format is unusual or the text quality is poor.`,
      );
    } catch (err: any) {
      console.error(`[companyExtractor] Claude attempt ${attempt} error: ${err.message}`);
      if (attempt >= MAX_ATTEMPTS) break;
    }
  }

  console.error(`[companyExtractor] All ${MAX_ATTEMPTS} Claude attempts failed.`);
  return null;
}
