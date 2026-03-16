/**
 * ONRC Company Data Extractor
 *
 * STRATEGY: Local first, AI fallback.
 * 1. Native PDF → PyMuPDF text → regex parser (free, <100ms)
 * 2. Scanned PDF → OpenAI GPT-4o Vision OCR → OpenAI GPT-4o parse (AI fallback)
 *
 * Anthropic is NOT used here — only OpenAI for scanned documents.
 */
import { openai } from "../lib/openai";
import { parseOnrcText } from "./onrcParser";

export interface ExtractedCompanyData {
  denumire: string;
  cui: string;
  regCom: string;
  euid?: string;
  formaJuridica: string;
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
  }>;
  administratori: Array<{
    name: string;
    role: string;
    powers?: string;
    mandateDuration?: string;
  }>;
  financials: Array<{
    year: number;
    cifraAfaceri: number;
    profitBrut: number;
    profitNet: number;
    angajati: number;
    angajatiEfectiv?: number;
    capitaluriProprii: number;
    activeImobilizate?: number;
    activeCirculante?: number;
  }>;
  caenPrincipal?: string;
  caenDesc?: string;
  activitatiSecundare?: Array<{ cod: string; den: string }>;
  sediiSecundare?: Array<{ denumire: string; adresa: string }>;
}

// ─── OpenAI prompt (used ONLY for scanned PDFs as fallback) ───

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
 */
function tryParseJSON(raw: string): any | null {
  let cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* continue */ }
  }
  return null;
}

/**
 * Extract company data from ONRC PDF text.
 *
 * Strategy:
 * 1. Try regex parser first (free, instant) — works for native PDFs
 * 2. If regex fails or returns insufficient data, AND the text came from OCR
 *    (scanned PDF), fall back to OpenAI GPT-4o for structured extraction
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

  // ─── Step 2: AI fallback — ONLY for scanned PDFs ───
  if (!hasScannedPages) {
    // Native PDF but regex couldn't parse it — return partial or null
    if (regexResult) {
      console.warn(`[companyExtractor] Native PDF, regex partial — returning partial data`);
      return regexResult;
    }
    console.error(`[companyExtractor] Native PDF but regex failed completely. Text sample: "${pdfText.slice(0, 200)}"`);
    return null;
  }

  console.log(`[companyExtractor] Scanned PDF detected — falling back to OpenAI GPT-4o`);
  return await extractWithOpenAI(pdfText);
}

/**
 * OpenAI GPT-4o extraction — used ONLY for scanned PDFs.
 */
async function extractWithOpenAI(pdfText: string): Promise<ExtractedCompanyData | null> {
  const textSample = pdfText.slice(0, 200);
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 1;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 8000,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: isRetry
              ? COMPANY_SYSTEM_PROMPT + "\n\nATENȚIE: Răspunsul tău anterior NU a fost JSON valid. Returnează EXCLUSIV un obiect JSON valid. Nimic altceva."
              : COMPANY_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: COMPANY_USER_PROMPT(pdfText),
          },
        ],
      });

      const responseText = response.choices[0]?.message?.content || "";
      const data = tryParseJSON(responseText);

      if (data) {
        if (!data.cui && !data.denumire) {
          console.warn(
            `[companyExtractor] OpenAI attempt ${attempt}: JSON valid but no cui/denumire. Keys: [${Object.keys(data).join(", ")}]`,
          );
          if (attempt < MAX_ATTEMPTS) continue;
          return Object.keys(data).length > 2 ? data : null;
        }
        console.log(`[companyExtractor] OpenAI extraction succeeded: CUI=${data.cui}, denumire="${data.denumire}"`);
        return data;
      }

      console.error(
        `[companyExtractor] OpenAI attempt ${attempt}/${MAX_ATTEMPTS}: JSON parse failed. ` +
        `Response length: ${responseText.length}, first 300 chars: "${responseText.slice(0, 300)}"`,
      );
    } catch (err: any) {
      console.error(`[companyExtractor] OpenAI attempt ${attempt} error: ${err.message}`);
      if (attempt >= MAX_ATTEMPTS) break;
    }
  }

  console.error(`[companyExtractor] All ${MAX_ATTEMPTS} OpenAI attempts failed.`);
  return null;
}
