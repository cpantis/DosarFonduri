import Anthropic from "@anthropic-ai/sdk";
import type { ExtractionResult } from "./extractionTypes";

const anthropic = new Anthropic();

/**
 * Extracts structured data from bank account statements (extras de cont).
 */
export async function extractExtrasCont(pdfText: string): Promise<ExtractionResult> {
  const start = Date.now();

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: `Ești expert în documente bancare românești. Extrage datele din extrasul de cont.

IMPORTANT:
- Soldul disponibil e suma de bani disponibilă la data extrasului
- Moneda e de obicei RON/LEI sau EUR
- Returnează DOAR JSON valid, fără backticks, fără explicații`,
    messages: [{
      role: "user",
      content: `Extrage datele din acest extras de cont. Returnează JSON:
{
  "banca": "Banca Transilvania",
  "sold_disponibil": 150000.50,
  "data_extras": "2024-06-30",
  "moneda": "RON",
  "iban": "RO12BTRL0000001234567890",
  "titular_cont": "SC Exemplu SRL",
  "titular_cui": "1234567"
}

TEXT DOCUMENT:
${pdfText.slice(0, 20000)}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const fields: ExtractionResult["extracted_fields"] = [];

  try {
    const data = JSON.parse(cleaned);

    if (data.banca) fields.push({ field_key: "banca", field_value: data.banca, confidence: 0.9, source_page: 1, extraction_method: "ai_haiku" });
    if (data.sold_disponibil != null) fields.push({ field_key: "sold_disponibil", field_value: data.sold_disponibil, confidence: 0.9, source_page: 1, extraction_method: "ai_haiku" });
    if (data.data_extras) fields.push({ field_key: "data_extras", field_value: data.data_extras, confidence: 0.9, source_page: 1, extraction_method: "ai_haiku" });
    if (data.moneda) fields.push({ field_key: "moneda_extras", field_value: data.moneda, confidence: 0.9, source_page: 1, extraction_method: "ai_haiku" });
    if (data.iban) fields.push({ field_key: "iban", field_value: data.iban, confidence: 0.9, source_page: 1, extraction_method: "ai_haiku" });
    if (data.titular_cont) fields.push({ field_key: "titular_cont", field_value: data.titular_cont, confidence: 0.85, source_page: 1, extraction_method: "ai_haiku" });
    if (data.titular_cui) fields.push({ field_key: "titular_cont_cui", field_value: data.titular_cui, confidence: 0.8, source_page: 1, extraction_method: "ai_haiku" });
  } catch {
    console.error("Failed to parse extras cont extraction JSON");
  }

  return {
    document_type: "extras_cont",
    extracted_fields: fields,
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}
