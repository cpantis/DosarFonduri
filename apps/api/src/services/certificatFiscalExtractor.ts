import Anthropic from "@anthropic-ai/sdk";
import type { ExtractionResult } from "./extractionTypes";

const anthropic = new Anthropic();

/**
 * Extract data from certificat fiscal (tax certificate) documents.
 * These certify that a company has no outstanding tax obligations.
 */
export async function extractCertificatFiscal(text: string): Promise<ExtractionResult> {
  const start = Date.now();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: "Extragi date structurate din certificate fiscale romanesti. Returnezi DOAR JSON valid.",
    messages: [{
      role: "user",
      content: `Extrage urmatoarele campuri din acest certificat fiscal:

${text.slice(0, 8000)}

Returnează un singur obiect JSON:
{
  "denumire_contribuabil": "...",
  "cui": "...",
  "adresa_fiscala": "...",
  "nr_certificat": "...",
  "data_emitere": "...",
  "data_valabilitate": "...",
  "emitent": "...",
  "obligatii_restante": true/false,
  "suma_restanta": null or number,
  "tip_obligatii": "buget_stat" | "buget_local" | "ambele"
}`,
    }],
  });

  const responseText = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const fields: ExtractionResult["extracted_fields"] = [];

  try {
    const parsed = JSON.parse(cleaned);

    if (parsed.denumire_contribuabil) fields.push({ field_key: "denumire_contribuabil", field_value: parsed.denumire_contribuabil, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (parsed.cui) fields.push({ field_key: "cui_fiscal", field_value: parsed.cui, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (parsed.adresa_fiscala) fields.push({ field_key: "adresa_fiscala", field_value: parsed.adresa_fiscala, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    if (parsed.nr_certificat) fields.push({ field_key: "nr_certificat_fiscal", field_value: parsed.nr_certificat, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (parsed.data_emitere) fields.push({ field_key: "data_emitere_certificat_fiscal", field_value: parsed.data_emitere, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (parsed.data_valabilitate) fields.push({ field_key: "data_valabilitate_certificat_fiscal", field_value: parsed.data_valabilitate, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    if (parsed.emitent) fields.push({ field_key: "emitent_certificat_fiscal", field_value: parsed.emitent, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    fields.push({ field_key: "obligatii_restante", field_value: !!parsed.obligatii_restante, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (parsed.suma_restanta != null) fields.push({ field_key: "suma_restanta_fiscala", field_value: parsed.suma_restanta, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    if (parsed.tip_obligatii) fields.push({ field_key: "tip_obligatii_fiscale", field_value: parsed.tip_obligatii, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });

    fields.push({ field_key: "_raw_certificat_fiscal", field_value: parsed, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  } catch {
    // Classification still succeeds even if extraction fails
  }

  return {
    document_type: "certificat_fiscal",
    extracted_fields: fields,
    raw_text: text.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}
