import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

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
  caenSecundare?: string[];
}

export async function extractCompanyFromDocument(pdfText: string): Promise<ExtractedCompanyData | null> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: `Ești expert în documente juridice românești. Primești textul unui PDF care poate conține MULTIPLE documente:
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
- "radiată" / "dizolvată" → "radiata"`,
    messages: [{
      role: "user",
      content: `Extrage datele firmei din acest document PDF.

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
  "caenSecundare": ["0111", "0112"]
}

TEXT DOCUMENT:
${pdfText.slice(0, 80000)}`
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const data = JSON.parse(cleaned);
    if (!data.cui || !data.denumire) return null;
    return data;
  } catch {
    console.error("Failed to parse company extraction JSON");
    return null;
  }
}
