import { anthropic, withAILimit } from "../lib/anthropic";
import type { ExtractionResult } from "./extractionTypes";

/**
 * Extracts structured data from Romanian ID cards (Carte de Identitate).
 * Uses Claude Sonnet Vision for image-based extraction — ID cards are almost
 * always scanned, so text-based extraction is unreliable.
 *
 * Also handles text-based extraction as fallback (e.g. when OCR already ran).
 */

const CI_SYSTEM_PROMPT = `Ești expert în documente de identitate românești. Extrage TOATE datele de pe cartea de identitate.

REGULI:
- CNP-ul are 13 cifre
- Seria are 2 litere (ex: RD, XZ, KT)
- Numărul are 6 cifre
- Sexul se deduce din prima cifră a CNP-ului: 1,5=M, 2,6=F
- Data nașterii se deduce din CNP: an(2-3), lună(4-5), zi(6-7)
- Valabilitatea este data de expirare de pe CI
- Returnează DOAR JSON valid, fără backticks, fără explicații`;

const CI_JSON_TEMPLATE = `{
  "serie": "RD",
  "numar": "123456",
  "cnp": "1850101123456",
  "nume": "POPESCU",
  "prenume": "ION VASILE",
  "cetatenie": "română",
  "loc_nastere": "Orașul",
  "judet_nastere": "Județul",
  "domiciliu": "Str. Exemplu, Nr. 10, Bl. A1, Sc. 2, Ap. 15",
  "localitate": "București",
  "judet": "Sector 1",
  "data_nastere": "1985-01-01",
  "sex": "M",
  "data_emitere": "2020-05-15",
  "data_expirare": "2030-05-15",
  "emitent": "SPCLEP Sect. 1"
}`;

/**
 * Extract CI data from a base64-encoded image (scan/photo of ID card).
 * Uses Claude Sonnet Vision directly.
 */
export async function extractCarteIdentitateFromImage(
  imageBase64: string,
  mediaType: string = "image/png",
): Promise<ExtractionResult> {
  const start = Date.now();

  const response = await withAILimit(() => anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: CI_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: imageBase64 },
        },
        {
          type: "text",
          text: `Extrage datele de pe această carte de identitate. Returnează JSON:\n${CI_JSON_TEMPLATE}`,
        },
      ],
    }],
  }));

  const textBlock = response.content.find((b: any) => b.type === "text");
  const responseText = textBlock ? (textBlock as any).text : "{}";
  return parseCIResponse(responseText, start);
}

/**
 * Extract CI data from already-extracted text (fallback when OCR already ran).
 */
export async function extractCarteIdentitate(text: string): Promise<ExtractionResult> {
  const start = Date.now();

  const response = await withAILimit(() => anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: CI_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `Extrage datele cărții de identitate din acest text:\n\n${text.slice(0, 5000)}\n\nReturnează JSON:\n${CI_JSON_TEMPLATE}`,
    }],
  }));

  const textBlock = response.content.find((b: any) => b.type === "text");
  const responseText = textBlock ? (textBlock as any).text : "{}";
  return parseCIResponse(responseText, start);
}

function parseCIResponse(responseText: string, startTime: number): ExtractionResult {
  const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const fields: ExtractionResult["extracted_fields"] = [];
  const method = "ai_sonnet";

  try {
    const data = JSON.parse(cleaned);

    if (data.cnp) fields.push({ field_key: "cnp", field_value: data.cnp, confidence: 0.95, source_page: 1, extraction_method: method });
    if (data.serie) fields.push({ field_key: "serie_ci", field_value: data.serie, confidence: 0.9, source_page: 1, extraction_method: method });
    if (data.numar) fields.push({ field_key: "numar_ci", field_value: data.numar, confidence: 0.9, source_page: 1, extraction_method: method });
    if (data.nume) fields.push({ field_key: "nume", field_value: data.nume, confidence: 0.95, source_page: 1, extraction_method: method });
    if (data.prenume) fields.push({ field_key: "prenume", field_value: data.prenume, confidence: 0.95, source_page: 1, extraction_method: method });
    if (data.cetatenie) fields.push({ field_key: "cetatenie", field_value: data.cetatenie, confidence: 0.85, source_page: 1, extraction_method: method });
    if (data.loc_nastere) fields.push({ field_key: "loc_nastere", field_value: data.loc_nastere, confidence: 0.85, source_page: 1, extraction_method: method });
    if (data.judet_nastere) fields.push({ field_key: "judet_nastere", field_value: data.judet_nastere, confidence: 0.85, source_page: 1, extraction_method: method });
    if (data.domiciliu) fields.push({ field_key: "domiciliu", field_value: data.domiciliu, confidence: 0.9, source_page: 1, extraction_method: method });
    if (data.localitate) fields.push({ field_key: "localitate_domiciliu", field_value: data.localitate, confidence: 0.9, source_page: 1, extraction_method: method });
    if (data.judet) fields.push({ field_key: "judet_domiciliu", field_value: data.judet, confidence: 0.9, source_page: 1, extraction_method: method });
    if (data.data_nastere) fields.push({ field_key: "data_nastere", field_value: data.data_nastere, confidence: 0.95, source_page: 1, extraction_method: method });
    if (data.sex) fields.push({ field_key: "sex", field_value: data.sex, confidence: 0.95, source_page: 1, extraction_method: method });
    if (data.data_emitere) fields.push({ field_key: "data_emitere_ci", field_value: data.data_emitere, confidence: 0.85, source_page: 1, extraction_method: method });
    if (data.data_expirare) fields.push({ field_key: "data_expirare_ci", field_value: data.data_expirare, confidence: 0.85, source_page: 1, extraction_method: method });
    if (data.emitent) fields.push({ field_key: "emitent_ci", field_value: data.emitent, confidence: 0.8, source_page: 1, extraction_method: method });

    fields.push({ field_key: "_raw_carte_identitate", field_value: data, confidence: 0.9, source_page: null, extraction_method: method });
  } catch {
    console.error("[carteIdentitateExtractor] Failed to parse Claude Sonnet response JSON");
  }

  return {
    document_type: "carte_identitate",
    extracted_fields: fields,
    raw_text: "",
    processing_time_ms: Date.now() - startTime,
  };
}
