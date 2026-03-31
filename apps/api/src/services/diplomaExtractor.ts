import { anthropic, withAILimit } from "../lib/anthropic";
import { safeJSONParse } from "../lib/safeExtract";
import type { ExtractionResult } from "./extractionTypes";

/**
 * Extracts structured data from diplomas and education certificates.
 * Handles: diplome de licență, master, doctorat, certificate de competențe.
 */
export async function extractDiploma(pdfText: string): Promise<ExtractionResult> {
  const start = Date.now();

  const response = await withAILimit(() => anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: `Ești expert în documente de studii românești. Extrage datele structurate din diploma/certificatul primit.

REGULI:
- Nivelul de studii: liceu, licenta, master, doctorat, postuniversitar, profesional
- Instituția poate fi universitate, academie, școală postliceală
- Specializarea/programul de studii e diferit de facultate
- Returnează DOAR JSON valid, fără backticks, fără explicații`,
    messages: [{
      role: "user",
      content: `Extrage datele din această diplomă/certificat de studii. Returnează JSON:
{
  "tip_document": "diploma_licenta",
  "institutie": "Universitatea de Științe Agricole și Medicină Veterinară",
  "facultate": "Facultatea de Agricultură",
  "specializare": "Inginerie Economică în Agricultură",
  "nivel_studii": "licenta",
  "titlu_obtinut": "Inginer",
  "nume_titular": "POPESCU ION",
  "cnp_titular": "1850101123456",
  "data_absolvirii": "2008-07-15",
  "nr_diploma": "123456",
  "serie_diploma": "A",
  "an_admitere": 2004,
  "an_absolvire": 2008,
  "forma_invatamant": "zi",
  "media_absolvire": 8.75,
  "limba_predare": "română"
}

TEXT DOCUMENT:
${pdfText.slice(0, 15000)}`,
    }],
  }));

  const text = response.content?.[0]?.type === "text" ? response.content[0].text : "";

  const fields: ExtractionResult["extracted_fields"] = [];

  const parsed = safeJSONParse(text, "diplomaExtractor");
  if (parsed) {
    const data = parsed.data;

    if (data.tip_document) fields.push({ field_key: "tip_document_studii", field_value: data.tip_document, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.institutie) fields.push({ field_key: "institutie_studii", field_value: data.institutie, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.facultate) fields.push({ field_key: "facultate", field_value: data.facultate, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.specializare) fields.push({ field_key: "specializare_studii", field_value: data.specializare, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.nivel_studii) fields.push({ field_key: "nivel_studii", field_value: data.nivel_studii, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.titlu_obtinut) fields.push({ field_key: "titlu_obtinut", field_value: data.titlu_obtinut, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.nume_titular) fields.push({ field_key: "nume_titular_diploma", field_value: data.nume_titular, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.cnp_titular) fields.push({ field_key: "cnp_titular_diploma", field_value: data.cnp_titular, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.data_absolvirii) fields.push({ field_key: "data_absolvirii", field_value: data.data_absolvirii, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.nr_diploma) fields.push({ field_key: "nr_diploma", field_value: data.nr_diploma, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.an_absolvire != null) fields.push({ field_key: "an_absolvire", field_value: data.an_absolvire, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.forma_invatamant) fields.push({ field_key: "forma_invatamant", field_value: data.forma_invatamant, confidence: 0.8, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.media_absolvire != null) fields.push({ field_key: "media_absolvire", field_value: data.media_absolvire, confidence: 0.8, source_page: 1, extraction_method: "ai_sonnet" });

    fields.push({ field_key: "_raw_diploma", field_value: data, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  } else {
    console.error("[diplomaExtractor] CRITICAL: Failed to parse extraction JSON");
  }

  return {
    document_type: "diploma_studii",
    extracted_fields: fields,
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}
