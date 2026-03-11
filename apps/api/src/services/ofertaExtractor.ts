import Anthropic from "@anthropic-ai/sdk";
import type { ExtractionResult } from "./extractionTypes";

const anthropic = new Anthropic();

/**
 * Extracts structured data from "ofertă de preț" (price quote) documents.
 */
export async function extractOferta(pdfText: string): Promise<ExtractionResult> {
  const start = Date.now();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: `Ești expert în oferte de preț pentru echipamente agricole/industriale. Extrage datele structurate din oferta primită.

IMPORTANT:
- Prețurile sunt în EUR dacă nu se specifică altfel
- este_no_till = true dacă echipamentul e de tip no-till/direct seeding
- Returnează DOAR JSON valid, fără backticks, fără explicații`,
    messages: [{
      role: "user",
      content: `Extrage datele din această ofertă de preț. Returnează JSON:
{
  "furnizor_nume": "Numele furnizorului",
  "furnizor_cui": "1234567",
  "furnizor_adresa": "Adresa",
  "articole": [
    {
      "utilaj_denumire": "Tractor John Deere 6130R",
      "specificatii_tehnice": "130 CP, 4WD, cabină AC",
      "pret_unitar_eur": 85000,
      "cantitate": 1,
      "pret_total_eur": 85000,
      "este_no_till": false
    }
  ],
  "total_oferta_eur": 85000,
  "valabilitate_oferta": "30 zile",
  "data_oferta": "2024-06-15",
  "nr_oferta": "OF-123/2024"
}

TEXT DOCUMENT:
${pdfText.slice(0, 60000)}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const fields: ExtractionResult["extracted_fields"] = [];

  try {
    const data = JSON.parse(cleaned);

    if (data.furnizor_nume) fields.push({ field_key: "furnizor_nume", field_value: data.furnizor_nume, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.furnizor_cui) fields.push({ field_key: "furnizor_cui", field_value: data.furnizor_cui, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.total_oferta_eur) fields.push({ field_key: "total_oferta_eur", field_value: data.total_oferta_eur, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
    if (data.valabilitate_oferta) fields.push({ field_key: "valabilitate_oferta", field_value: data.valabilitate_oferta, confidence: 0.8, source_page: null, extraction_method: "ai_sonnet" });
    if (data.data_oferta) fields.push({ field_key: "data_oferta", field_value: data.data_oferta, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.nr_oferta) fields.push({ field_key: "nr_oferta", field_value: data.nr_oferta, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });

    const articole = data.articole || [];
    articole.forEach((a: any, i: number) => {
      const prefix = `articol_${i}`;
      if (a.utilaj_denumire) fields.push({ field_key: `${prefix}_utilaj_denumire`, field_value: a.utilaj_denumire, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
      if (a.specificatii_tehnice) fields.push({ field_key: `${prefix}_specificatii_tehnice`, field_value: a.specificatii_tehnice, confidence: 0.8, source_page: null, extraction_method: "ai_sonnet" });
      if (a.pret_unitar_eur != null) fields.push({ field_key: `${prefix}_pret_unitar_eur`, field_value: a.pret_unitar_eur, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
      if (a.pret_total_eur != null) fields.push({ field_key: `${prefix}_pret_total_eur`, field_value: a.pret_total_eur, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
      if (a.este_no_till != null) fields.push({ field_key: `${prefix}_este_no_till`, field_value: a.este_no_till, confidence: 0.75, source_page: null, extraction_method: "ai_sonnet" });
    });

    fields.push({ field_key: "_raw_articole", field_value: articole, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  } catch {
    console.error("Failed to parse oferta extraction JSON");
  }

  return {
    document_type: "oferta_pret",
    extracted_fields: fields,
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}
