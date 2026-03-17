/**
 * ONRC Company Data Extractor
 *
 * STRATEGY: AI-first with regex validation.
 * 1. Extract text from PDF (PyMuPDF / OCR)
 * 2. Send text to Claude Sonnet for structured extraction (always)
 * 3. Use regex parser as validation / fallback if AI fails
 *
 * AI extraction is more accurate than regex for Romanian ONRC documents
 * because it handles format variations, diacritics, and unusual layouts.
 * Cost: ~$0.04 per extraction — negligible.
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

// ─── Claude prompt (primary extraction method) ───

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

REGULI IMPORTANTE:
- Extrage EXACT datele din document, nu inventa nimic
- Valorile financiare sunt în LEI (numere întregi, fără zecimale)
- Pierderile sunt NEGATIVE
- Numerele românești: "1.234.567,89" = 1234567.89 (puncte = mii, virgulă = zecimale)
- Datele nașterii: format "YYYY-MM-DD"
- Procentele: valoare numerică (ex: 33.333333, nu "33.333333%")
- Extrage TOȚI asociații și administratorii, nu doar primul
- Extrage date financiare pentru FIECARE an disponibil
- Extrage TOATE activitățile CAEN secundare

RETURNEAZĂ DOAR JSON valid, fără backticks, fără explicații.

MAPARE FORME JURIDICE (text → cod):
- "Societate cu Raspundere Limitata" / "S.R.L." → "SRL"
- "Societate pe Actiuni" / "S.A." → "SA"
- "Persoana Fizica Autorizata" / "P.F.A." → "PFA"
- "Intreprindere Individuala" / "I.I." → "II"
- "Intreprindere Familiala" / "I.F." → "IF"
- "Societate in Nume Colectiv" / "S.N.C." → "SNC"
- "Societate in Comandita Simpla" / "S.C.S." → "SCS"
- "Societate in Comandita pe Actiuni" / "S.C.A." → "SCA"
- "Asociatie" / "Fundatie" / "ONG" → "ONG"
- "Regie Autonoma" / "R.A." → "RA"
- "S.R.L.-D." / "SRL-D" → "SRL-D"

STARE FIRMĂ:
- "funcțiune" → "Funcțiune"
- "radiată" / "dizolvată" → "Radiată"
- "lichidare" → "Lichidare"`;

const COMPANY_USER_PROMPT = (pdfText: string) => `Extrage datele firmei din acest document PDF.

Returnează JSON cu structura EXACTĂ (toate câmpurile sunt opționale, include doar ce găsești):
{
  "denumire": "NUMELE FIRMEI S.R.L.",
  "cui": "1234567",
  "regCom": "J20/333/1992",
  "euid": "ROONRC.J20/333/1992",
  "formaJuridica": "SRL",
  "adresa": "Jud. Arad, Mun. Arad, Str. Exemplu, Nr. 10",
  "localitate": "Arad",
  "judet": "Arad",
  "telefon": "0722123456",
  "email": "contact@firma.ro",
  "stare": "Funcțiune",
  "durata": "Nelimitată",
  "anInfiintare": 1992,
  "capitalSocial": 1500,
  "moneda": "LEI",
  "partiSociale": 150,
  "naturaCapital": { "privatAutohton": 100, "privatStrain": 0, "stat": 0 },
  "asociati": [
    {
      "type": "pf",
      "name": "POPESCU ION",
      "role": "asociat unic",
      "citizenship": "română",
      "contribution": 1500,
      "shares": 150,
      "pctBenefits": 100,
      "pctLosses": 100,
      "dataNasterii": "1985-03-15",
      "locNastere": "Arad, România",
      "sex": "masculin",
      "stareCivila": "căsătorit"
    }
  ],
  "administratori": [
    {
      "name": "POPESCU ION",
      "role": "administrator",
      "powers": "DEPLINE",
      "mandateDuration": "Nelimitat",
      "appointmentDate": "2020-01-15",
      "citizenship": "română",
      "dataNasterii": "1985-03-15",
      "sex": "masculin"
    }
  ],
  "financials": [
    {
      "year": 2023,
      "cifraAfaceri": 33883844,
      "profitBrut": 6567414,
      "profitNet": 5294485,
      "angajati": 124,
      "capitaluriProprii": 27376475,
      "activeImobilizate": 4218,
      "activeCirculante": 1500000
    }
  ],
  "caenPrincipal": "0220",
  "caenDesc": "Exploatare forestieră",
  "activitatiSecundare": [
    { "cod": "0111", "den": "Cultivarea cerealelor" }
  ],
  "sediiSecundare": [
    { "denumire": "Punct de lucru", "adresa": "Str. Y, Nr. 5, Arad" }
  ],
  "sediuSocial": { "actSediu": "Contract de vânzare-cumpărare", "durataSediu": "Nelimitată" }
}

IMPORTANT:
- Pentru asociați PJ (persoane juridice), folosește "type": "pj" și adaugă "cuiPJ" și "regComPJ" dacă sunt disponibile
- Extrage financials pentru FIECARE an disponibil (poate fi 2020, 2021, 2022, 2023 etc.)
- Procentele ca numere: 33.333333 nu "33.333333%"
- Nu include câmpuri cu valori null/undefined/goale — omite-le complet

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
 * Strategy: AI-first with regex validation.
 * 1. Always send text to Claude Sonnet for structured extraction
 * 2. Run regex parser in parallel as validation / cross-check
 * 3. If AI fails, fall back to regex result
 *
 * @param pdfText - Extracted text from PDF (native or OCR)
 */
export async function extractCompanyFromDocument(
  pdfText: string,
): Promise<ExtractedCompanyData | null> {
  // ─── Step 1: Run AI extraction + regex in parallel ───
  console.log(`[companyExtractor] AI-first extraction. Text length: ${pdfText.length}, sample: "${pdfText.slice(0, 150)}"`);

  const [aiResult, regexResult] = await Promise.all([
    extractWithClaude(pdfText).catch((err) => {
      console.error(`[companyExtractor] AI extraction failed:`, err.message);
      return null;
    }),
    Promise.resolve(parseOnrcText(pdfText)),
  ]);

  // ─── Step 2: Use AI result if available ───
  if (aiResult) {
    // Validate AI result has minimum required data
    if (aiResult.cui || aiResult.denumire) {
      // Cross-check with regex for CUI validation (if regex also found a CUI)
      if (regexResult?.cui && aiResult.cui && regexResult.cui !== aiResult.cui) {
        console.warn(
          `[companyExtractor] CUI mismatch: AI="${aiResult.cui}" vs regex="${regexResult.cui}". Using AI result.`
        );
      }
      const aiFieldCount = Object.entries(aiResult)
        .filter(([_, v]) => v !== undefined && v !== "" && v !== 0 && (!Array.isArray(v) || v.length > 0))
        .length;
      console.log(
        `[companyExtractor] AI extraction succeeded: CUI=${aiResult.cui}, denumire="${aiResult.denumire}", ${aiFieldCount} fields`
      );
      return aiResult;
    }
    console.warn(`[companyExtractor] AI returned data but no CUI/denumire. Falling back to regex.`);
  }

  // ─── Step 3: Fallback to regex if AI failed ───
  if (regexResult) {
    const hasCui = !!regexResult.cui;
    const hasDenumire = !!regexResult.denumire;
    if (hasCui || hasDenumire) {
      console.log(`[companyExtractor] Regex fallback: CUI=${regexResult.cui}, denumire="${regexResult.denumire}"`);
      return regexResult;
    }
  }

  console.error(`[companyExtractor] Both AI and regex extraction failed.`);
  return null;
}

/**
 * Claude Sonnet extraction — primary extraction method.
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
