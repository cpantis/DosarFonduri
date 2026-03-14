import { anthropic, withAILimit } from "../lib/anthropic";

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
    { "cod": "0111", "den": "Cultivarea cerealelor (exclusiv orez), plantelor leguminoase și a plantelor producătoare de semințe oleaginoase" },
    { "cod": "0112", "den": "Cultivarea orezului" }
  ],
  "sediiSecundare": [
    { "denumire": "Punct de lucru 1", "adresa": "Str. Example, Nr. 10, Oraș, Județ" }
  ]
}

TEXT DOCUMENT:
${pdfText.slice(0, 80000)}`;

/**
 * Try to extract valid JSON from a raw AI response text.
 * Handles: backtick wrappers, leading/trailing text around JSON, nested objects.
 */
function tryParseJSON(raw: string): any | null {
  // Step 1: Clean backtick wrappers
  let cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  // Step 2: Direct parse
  try { return JSON.parse(cleaned); } catch { /* continue */ }

  // Step 3: Regex — find outermost { ... }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* continue */ }
  }

  return null;
}

export async function extractCompanyFromDocument(pdfText: string): Promise<ExtractedCompanyData | null> {
  const textSample = pdfText.slice(0, 200);
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 1;

    const response = await withAILimit(() => anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: isRetry
        ? COMPANY_SYSTEM_PROMPT + "\n\nATENȚIE: Răspunsul tău anterior NU a fost JSON valid. Returnează EXCLUSIV un obiect JSON valid. Nimic altceva — niciun text înainte sau după JSON."
        : COMPANY_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: COMPANY_USER_PROMPT(pdfText),
      }],
    }));

    const responseText = response.content[0].type === "text" ? response.content[0].text : "";
    const data = tryParseJSON(responseText);

    if (data) {
      // Accept partial data — don't throw away 48 fields because CUI is missing
      if (!data.cui && !data.denumire) {
        console.warn(
          `[companyExtractor] Attempt ${attempt}: JSON valid but no cui/denumire found. ` +
          `Keys present: [${Object.keys(data).join(", ")}]. Text sample: "${textSample}"`,
        );
        if (attempt < MAX_ATTEMPTS) continue; // retry might yield better results
        // On last attempt, return partial data if it has ANY useful fields
        const hasAnyData = Object.keys(data).length > 2;
        if (hasAnyData) {
          console.warn(`[companyExtractor] Returning partial data (${Object.keys(data).length} keys) despite missing cui/denumire`);
          return data;
        }
        return null;
      }
      return data;
    }

    // JSON parse failed
    console.error(
      `[companyExtractor] Attempt ${attempt}/${MAX_ATTEMPTS}: JSON parse failed. ` +
      `Response length: ${responseText.length}, first 300 chars: "${responseText.slice(0, 300)}". ` +
      `Input text sample: "${textSample}"`,
    );
  }

  console.error(`[companyExtractor] All ${MAX_ATTEMPTS} attempts failed to produce valid JSON.`);
  return null;
}
