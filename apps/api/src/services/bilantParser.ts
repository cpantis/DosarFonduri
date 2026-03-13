import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface ParsedBilant {
  year: number;
  f10: any;
  f20: any;
  f30: any;
  f40?: any;
}

const BILANT_SYSTEM_PROMPT = `Ești un expert în contabilitate românească. Extrage datele din bilanțul ANAF în format JSON strict.

    IMPORTANT:
    - Valorile sunt în LEI (numere întregi, fără decimale)
    - Pierderile sunt negative
    - Dacă un câmp nu există sau e gol, omite-l (nu pune 0)
    - Respectă EXACT structura cerută
    - F10 = Bilanț prescurtat
    - F20 = Cont de Profit și Pierdere
    - F30 = Date informative
    - F40 = Situația activelor imobilizate`;

const BILANT_USER_PROMPT = (pdfText: string, year: number) => `Extrage datele din acest bilanț ANAF pentru anul ${year}. Returnează DOAR JSON valid, fără backticks, fără explicații.

Structura cerută:
{
  "f10": {
    "activeImobilizate": { "necorporale": number, "corporale": number, "financiare": number, "total": number },
    "activeCirculante": { "stocuri": number, "creante": number, "investitiiTS": number, "casa": number, "total": number },
    "cheltuieliAvans": number,
    "datoriiSubAnul": number,
    "datoriiPesteAnul": number,
    "venituriAvans": number,
    "capital": { "subscrisVarsat": number, "rezerve": number, "profitReportat": number, "profitExercitiu": number },
    "capitaluriProprii": number
  },
  "f20": {
    "cifraAfaceriNeta": number,
    "venituriExploatare": number,
    "cheltuieliExploatare": number,
    "profitExploatare": number,
    "venituriTotale": number,
    "cheltuieliTotale": number,
    "profitBrut": number,
    "impozitProfit": number,
    "profitNet": number
  },
  "f30": {
    "numarMediuSalariati": number,
    "numarEfectivSalariati": number
  },
  "f40": {
    "totalCorporale": { "soldInitial": number, "cresteri": number, "reduceri": number, "soldFinal": number },
    "amortizareTotal": number
  }
}

TEXT BILANȚ:
${pdfText}`;

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

export async function parseBilantPDF(pdfText: string, year: number): Promise<ParsedBilant> {
  const textSample = pdfText.slice(0, 200);
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 1;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: isRetry
        ? BILANT_SYSTEM_PROMPT + "\n\nATENȚIE: Răspunsul tău anterior NU a fost JSON valid. Returnează EXCLUSIV un obiect JSON valid cu cheile f10, f20, f30, f40. Nimic altceva."
        : BILANT_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: BILANT_USER_PROMPT(pdfText, year),
      }],
    });

    const responseText = response.content[0].type === "text" ? response.content[0].text : "";
    const data = tryParseJSON(responseText);

    if (data) {
      // Accept partial data — f10 or f20 alone is still valuable
      if (!data.f10 && !data.f20) {
        console.warn(
          `[bilantParser] Attempt ${attempt}: JSON valid but no f10/f20 found. ` +
          `Keys: [${Object.keys(data).join(", ")}]. Year: ${year}. Text sample: "${textSample}"`,
        );
        if (attempt < MAX_ATTEMPTS) continue;
      }
      return { year, ...data };
    }

    console.error(
      `[bilantParser] Attempt ${attempt}/${MAX_ATTEMPTS}: JSON parse failed. ` +
      `Response length: ${responseText.length}, first 300 chars: "${responseText.slice(0, 300)}". ` +
      `Year: ${year}. Input text sample: "${textSample}"`,
    );
  }

  // All attempts failed — return empty structure instead of throwing
  console.error(`[bilantParser] All ${MAX_ATTEMPTS} attempts failed. Returning empty bilant for year ${year}.`);
  return { year, f10: null, f20: null, f30: null };
}
