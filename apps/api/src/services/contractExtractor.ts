import Anthropic from "@anthropic-ai/sdk";
import type { ExtractionResult } from "./extractionTypes";

const anthropic = new Anthropic();

/**
 * Extracts structured data from "contract de arendă" documents.
 * Returns an array of parcels/UATs from a single contract.
 */
export async function extractContract(pdfText: string): Promise<ExtractionResult> {
  const start = Date.now();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: `Ești expert în contracte de arendă agricolă românești. Extrage datele structurate din contractul primit.

IMPORTANT:
- Un contract poate avea MULTIPLE parcele/UAT-uri — returnează array
- Suprafața e în hectare (ha)
- Datele trebuie să fie în format ISO (YYYY-MM-DD)
- Returnează DOAR JSON valid, fără backticks, fără explicații`,
    messages: [{
      role: "user",
      content: `Extrage datele din acest contract de arendă. Returnează JSON cu structura:
{
  "parcele": [
    {
      "UAT": "nume localitate",
      "suprafata_ha": 10.5,
      "durata_contract": "5 ani",
      "data_start": "2024-01-01",
      "data_sfarsit": "2029-01-01",
      "arendator_nume": "Nume complet",
      "arendator_cui": "1234567",
      "nr_cadastral": "12345",
      "tarla": "T10",
      "parcela": "P20"
    }
  ],
  "arendas_nume": "Numele arendasului",
  "arendas_cui": "7654321",
  "data_contract": "2024-01-01",
  "nr_contract": "123/2024"
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

    if (data.nr_contract) {
      fields.push({ field_key: "nr_contract", field_value: data.nr_contract, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    }
    if (data.data_contract) {
      fields.push({ field_key: "data_contract", field_value: data.data_contract, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    }
    if (data.arendas_nume) {
      fields.push({ field_key: "arendas_nume", field_value: data.arendas_nume, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    }
    if (data.arendas_cui) {
      fields.push({ field_key: "arendas_cui", field_value: data.arendas_cui, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    }

    const parcele = data.parcele || [];
    parcele.forEach((p: any, i: number) => {
      const prefix = `parcela_${i}`;
      if (p.UAT) fields.push({ field_key: `${prefix}_UAT`, field_value: p.UAT, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (p.suprafata_ha) fields.push({ field_key: `${prefix}_suprafata_ha`, field_value: p.suprafata_ha, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (p.durata_contract) fields.push({ field_key: `${prefix}_durata_contract`, field_value: p.durata_contract, confidence: 0.8, source_page: null, extraction_method: "ai_sonnet" });
      if (p.data_start) fields.push({ field_key: `${prefix}_data_start`, field_value: p.data_start, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (p.data_sfarsit) fields.push({ field_key: `${prefix}_data_sfarsit`, field_value: p.data_sfarsit, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (p.arendator_nume) fields.push({ field_key: `${prefix}_arendator_nume`, field_value: p.arendator_nume, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (p.arendator_cui) fields.push({ field_key: `${prefix}_arendator_cui`, field_value: p.arendator_cui, confidence: 0.8, source_page: null, extraction_method: "ai_sonnet" });
    });

    // Also store the full structured data
    fields.push({ field_key: "_raw_parcele", field_value: parcele, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  } catch {
    console.error("Failed to parse contract extraction JSON");
  }

  return {
    document_type: "contract_arenda",
    extracted_fields: fields,
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}
