import Anthropic from "@anthropic-ai/sdk";
import type { ExtractionResult } from "./extractionTypes";

const anthropic = new Anthropic();

/**
 * Extracts structured data from environmental documents
 * (clasare mediu, decizie de încadrare, acord de mediu).
 */
export async function extractDocumentMediu(pdfText: string): Promise<ExtractionResult> {
  const start = Date.now();

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: `Ești expert în documente de mediu românești. Extrage datele structurate.

Tipuri posibile:
- "clasare" — notificare de clasare (proiectul nu necesită evaluare de mediu)
- "decizie_incadrare" — decizie etapa de încadrare
- "acord_mediu" — acord de mediu complet

Dacă nu poți extrage un câmp, pune null ca valoare.
Returnează DOAR JSON valid, fără backticks, fără explicații.`,
    messages: [{
      role: "user",
      content: `Extrage datele din acest document de mediu. Returnează JSON:
{
  "tip_document": "clasare",
  "numar_document": "123/2024",
  "data_emitere": "2024-05-15",
  "emitent": "APM Timiș",
  "titular_nume": "SC Exemplu SRL",
  "titular_cui": "1234567",
  "proiect_denumire": "Modernizare fermă",
  "locatie": "Sat X, Comuna Y, Județul Z"
}

TEXT DOCUMENT:
${pdfText.slice(0, 30000)}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const fields: ExtractionResult["extracted_fields"] = [];

  try {
    const data = JSON.parse(cleaned);

    fields.push({ field_key: "tip_document_mediu", field_value: data.tip_document ?? null, confidence: data.tip_document ? 0.9 : 0, source_page: 1, extraction_method: "ai_haiku" });
    fields.push({ field_key: "numar_document_mediu", field_value: data.numar_document ?? null, confidence: data.numar_document ? 0.9 : 0, source_page: 1, extraction_method: "ai_haiku" });
    fields.push({ field_key: "data_emitere_mediu", field_value: data.data_emitere ?? null, confidence: data.data_emitere ? 0.85 : 0, source_page: 1, extraction_method: "ai_haiku" });
    fields.push({ field_key: "emitent_mediu", field_value: data.emitent ?? null, confidence: data.emitent ? 0.85 : 0, source_page: 1, extraction_method: "ai_haiku" });
    fields.push({ field_key: "titular_mediu_nume", field_value: data.titular_nume ?? null, confidence: data.titular_nume ? 0.85 : 0, source_page: null, extraction_method: "ai_haiku" });
    fields.push({ field_key: "titular_mediu_cui", field_value: data.titular_cui ?? null, confidence: data.titular_cui ? 0.8 : 0, source_page: null, extraction_method: "ai_haiku" });
    fields.push({ field_key: "proiect_mediu_denumire", field_value: data.proiect_denumire ?? null, confidence: data.proiect_denumire ? 0.8 : 0, source_page: null, extraction_method: "ai_haiku" });
    fields.push({ field_key: "locatie_mediu", field_value: data.locatie ?? null, confidence: data.locatie ? 0.8 : 0, source_page: null, extraction_method: "ai_haiku" });
  } catch {
    console.error("Failed to parse document mediu extraction JSON");
  }

  return {
    document_type: "document_mediu",
    extracted_fields: fields,
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}
