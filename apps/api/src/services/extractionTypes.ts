/**
 * Standardized extraction result format.
 * All document extractors return this shape.
 */
export interface ExtractedField {
  field_key: string;
  field_value: any;
  confidence: number; // 0.0–1.0
  source_page: number | null;
  extraction_method: "ai_haiku" | "ai_sonnet" | "ai_opus" | "regex" | "ocr_direct";
}

export interface ExtractionResult {
  document_type: string;
  extracted_fields: ExtractedField[];
  raw_text: string;
  processing_time_ms: number;
}
