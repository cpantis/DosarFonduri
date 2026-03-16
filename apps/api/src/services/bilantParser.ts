import { anthropic, withAILimit } from "../lib/anthropic";

export interface ParsedBilant {
  year: number;
  f10: any;
  f20: any;
  f30: any;
  f40?: any;
}

const BILANT_SYSTEM_PROMPT = `Ești un expert în contabilitate românească specializat în bilanțuri ANAF. Extrage datele din bilanțul ANAF în format JSON strict.

IMPORTANT:
- Valorile sunt în LEI (numere întregi, fără decimale)
- Pierderile sunt NEGATIVE (adaugă semnul -)
- Dacă un câmp nu există sau e gol, NU-l include (nu pune 0 sau null)
- Respectă EXACT structura cerută, NU adăuga câmpuri noi
- F10 = Bilanț prescurtat (Formularul 10) — active, pasive, capitaluri
- F20 = Cont de Profit și Pierdere (Formularul 20) — venituri, cheltuieli, profit
- F30 = Date informative (Formularul 30) — angajați, datorii restante
- F40 = Situația activelor imobilizate (Formularul 40) — achiziții, cedări, amortizare

FORMATUL ANAF:
- Bilanțul ANAF are coloane: "Nr.rd." (rând), "Sold la începutul anului", "Sold la sfârșitul anului"
- Unele bilanțe sunt XFA (au tag-uri ca "rd_010", "rd_020")
- Altele sunt text simplu cu tabele de numere
- Cifra de afaceri netă = rândul 010 din F20 (sau "Cifra de afaceri neta")
- Capitaluri proprii = de obicei ultimul rând din F10 secțiunea K/J

VALIDARE:
- Active totale ≈ Pasive totale (eroare acceptabilă < 5%)
- Profit net ≈ Profit brut - Impozit profit
- Cifra afaceri ≥ Profit brut (de obicei)`;

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

/**
 * Quick regex pre-extraction for XFA bilanțe (tag-based format).
 * XFA bilanțe have predictable tags like "CifraDeAfaceriNeta" or "rd_010".
 * This doesn't replace AI extraction but provides a validation reference.
 */
function preExtractXFA(text: string): Partial<ParsedBilant> | null {
  const isXFA = /rd_\d{3}|CifraDeAfaceri|CapitaluriProprii|ProfitNet/i.test(text);
  if (!isXFA) return null;

  const extractNum = (pattern: RegExp): number | undefined => {
    const m = text.match(pattern);
    if (!m) return undefined;
    const val = parseInt(m[1].replace(/\s/g, ""));
    return isNaN(val) ? undefined : val;
  };

  const f20: any = {};
  const cifra = extractNum(/(?:CifraDeAfaceriNeta|cifra_afaceri_neta|rd_010)\s*[:=]?\s*(-?\d[\d\s]*)/i);
  if (cifra != null) f20.cifraAfaceriNeta = cifra;
  const profitBrut = extractNum(/(?:ProfitBrut|profit_brut|rd_300)\s*[:=]?\s*(-?\d[\d\s]*)/i);
  if (profitBrut != null) f20.profitBrut = profitBrut;
  const profitNet = extractNum(/(?:ProfitNet|profit_net|rd_320)\s*[:=]?\s*(-?\d[\d\s]*)/i);
  if (profitNet != null) f20.profitNet = profitNet;

  const f10: any = {};
  const capitaluri = extractNum(/(?:CapitaluriProprii|capitaluri_proprii)\s*[:=]?\s*(-?\d[\d\s]*)/i);
  if (capitaluri != null) f10.capitaluriProprii = capitaluri;

  const f30: any = {};
  const angajati = extractNum(/(?:NumarMediuSalariati|numar_mediu_salariati|nr_mediu_sal)\s*[:=]?\s*(\d[\d\s]*)/i);
  if (angajati != null) f30.numarMediuSalariati = angajati;

  if (Object.keys(f20).length === 0 && Object.keys(f10).length === 0) return null;

  return {
    year: 0,
    f10: Object.keys(f10).length > 0 ? f10 : null,
    f20: Object.keys(f20).length > 0 ? f20 : null,
    f30: Object.keys(f30).length > 0 ? f30 : null,
  };
}

export async function parseBilantPDF(pdfText: string, year: number): Promise<ParsedBilant> {
  const textSample = pdfText.slice(0, 200);
  const MAX_ATTEMPTS = 2;

  // Try XFA pre-extraction as reference
  const xfaRef = preExtractXFA(pdfText);
  if (xfaRef) {
    console.log(`[bilantParser] XFA pre-extraction found: f20 keys=[${Object.keys(xfaRef.f20 || {}).join(",")}]`);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 1;

    const response = await withAILimit(() => anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: isRetry
        ? BILANT_SYSTEM_PROMPT + "\n\nATENȚIE: Răspunsul tău anterior NU a fost JSON valid. Returnează EXCLUSIV un obiect JSON valid cu cheile f10, f20, f30, f40. Nimic altceva."
        : BILANT_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: BILANT_USER_PROMPT(pdfText, year),
      }],
    }));

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

      // Cross-validate with XFA pre-extraction if available
      if (xfaRef?.f20?.cifraAfaceriNeta && data.f20?.cifraAfaceriNeta) {
        const diff = Math.abs(xfaRef.f20.cifraAfaceriNeta - data.f20.cifraAfaceriNeta);
        const pct = diff / Math.max(xfaRef.f20.cifraAfaceriNeta, 1);
        if (pct > 0.1) {
          console.warn(
            `[bilantParser] Cifra afaceri mismatch: XFA=${xfaRef.f20.cifraAfaceriNeta}, AI=${data.f20.cifraAfaceriNeta} (${(pct * 100).toFixed(1)}% diff)`,
          );
        }
      }

      return { year, ...data };
    }

    console.error(
      `[bilantParser] Attempt ${attempt}/${MAX_ATTEMPTS}: JSON parse failed. ` +
      `Response length: ${responseText.length}, first 300 chars: "${responseText.slice(0, 300)}". ` +
      `Year: ${year}. Input text sample: "${textSample}"`,
    );
  }

  // All AI attempts failed — try to use XFA pre-extraction as fallback
  if (xfaRef && (xfaRef.f10 || xfaRef.f20)) {
    console.warn(`[bilantParser] AI failed but XFA pre-extraction available. Using XFA data for year ${year}.`);
    return { year, f10: xfaRef.f10, f20: xfaRef.f20, f30: xfaRef.f30 };
  }

  console.error(`[bilantParser] All ${MAX_ATTEMPTS} attempts failed. Returning empty bilant for year ${year}.`);
  return { year, f10: null, f20: null, f30: null };
}
