import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface ParsedBilant {
  year: number;
  f10: any;
  f20: any;
  f30: any;
  f40?: any;
}

export async function parseBilantPDF(pdfText: string, year: number): Promise<ParsedBilant> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: `Ești un expert în contabilitate românească. Extrage datele din bilanțul ANAF în format JSON strict.

    IMPORTANT:
    - Valorile sunt în LEI (numere întregi, fără decimale)
    - Pierderile sunt negative
    - Dacă un câmp nu există sau e gol, omite-l (nu pune 0)
    - Respectă EXACT structura cerută
    - F10 = Bilanț prescurtat
    - F20 = Cont de Profit și Pierdere
    - F30 = Date informative
    - F40 = Situația activelor imobilizate`,
    messages: [{
      role: "user",
      content: `Extrage datele din acest bilanț ANAF pentru anul ${year}. Returnează DOAR JSON valid, fără backticks, fără explicații.

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
${pdfText}`
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return { year, ...parsed };
}
