import Anthropic from "@anthropic-ai/sdk";
import type { ExtractionResult } from "./extractionTypes";

const anthropic = new Anthropic();

/**
 * Extracts structured data from "registru imobilizări" (fixed assets register) documents.
 */
export async function extractRegistruImobilizari(pdfText: string): Promise<ExtractionResult> {
  const start = Date.now();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 6000,
    system: `Ești expert în contabilitate românească. Extrage registrul de imobilizări corporale (mijloace fixe) din documentul primit.

IMPORTANT:
- Concentrează-te pe echipamente agricole: tractoare, combine, semănători, pluguri, etc.
- Puterea în CP (cai putere) e relevantă doar pentru tractoare și combine
- Categorie poate fi: "tractor", "combina", "utilaj_agricol", "vehicul", "echipament_irigat", "altele"
- Valorile sunt în LEI
- Returnează DOAR JSON valid, fără backticks, fără explicații`,
    messages: [{
      role: "user",
      content: `Extrage lista de imobilizări corporale. Returnează JSON:
{
  "echipamente": [
    {
      "denumire": "Tractor New Holland T7.210",
      "nr_inventar": "2145",
      "an_achizitie": 2019,
      "valoare_inventar": 450000,
      "amortizare_cumulata": 180000,
      "valoare_ramasa": 270000,
      "putere_cp": 210,
      "stare": "functional",
      "categorie": "tractor"
    }
  ],
  "total_valoare_inventar": 2500000,
  "total_amortizare": 1000000,
  "data_registru": "2024-12-31"
}

TEXT DOCUMENT:
${pdfText.slice(0, 80000)}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const fields: ExtractionResult["extracted_fields"] = [];

  try {
    const data = JSON.parse(cleaned);

    if (data.total_valoare_inventar) fields.push({ field_key: "total_valoare_inventar", field_value: data.total_valoare_inventar, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
    if (data.total_amortizare) fields.push({ field_key: "total_amortizare", field_value: data.total_amortizare, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
    if (data.data_registru) fields.push({ field_key: "data_registru", field_value: data.data_registru, confidence: 0.8, source_page: 1, extraction_method: "ai_sonnet" });

    const echipamente = data.echipamente || [];
    echipamente.forEach((e: any, i: number) => {
      const prefix = `echipament_${i}`;
      if (e.denumire) fields.push({ field_key: `${prefix}_denumire`, field_value: e.denumire, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (e.an_achizitie) fields.push({ field_key: `${prefix}_an_achizitie`, field_value: e.an_achizitie, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (e.valoare_inventar) fields.push({ field_key: `${prefix}_valoare_inventar`, field_value: e.valoare_inventar, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (e.putere_cp) fields.push({ field_key: `${prefix}_putere_cp`, field_value: e.putere_cp, confidence: 0.8, source_page: null, extraction_method: "ai_sonnet" });
      if (e.stare) fields.push({ field_key: `${prefix}_stare`, field_value: e.stare, confidence: 0.75, source_page: null, extraction_method: "ai_sonnet" });
      if (e.categorie) fields.push({ field_key: `${prefix}_categorie`, field_value: e.categorie, confidence: 0.8, source_page: null, extraction_method: "ai_sonnet" });
    });

    fields.push({ field_key: "_raw_echipamente", field_value: echipamente, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  } catch {
    console.error("Failed to parse registru imobilizari extraction JSON");
  }

  return {
    document_type: "registru_imobilizari",
    extracted_fields: fields,
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}
