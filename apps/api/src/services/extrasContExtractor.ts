import { anthropic, withAILimit } from "../lib/anthropic";
import type { ExtractionResult } from "./extractionTypes";

/**
 * Count business days (Mon-Fri) between two dates.
 * Returns the number of business days elapsed since `dateStr` until `referenceDate`.
 */
function businessDaysSince(dateStr: string, referenceDate: Date = new Date()): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return -1;

  let count = 0;
  const current = new Date(d);
  current.setHours(0, 0, 0, 0);
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);

  while (current < ref) {
    current.setDate(current.getDate() + 1);
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
  }

  return count;
}

/**
 * Extracts structured data from bank account statements (extras de cont).
 *
 * Includes AFIR freshness check: statement must be < 5 business days old.
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
- Data extrasului trebuie să fie în format ISO (YYYY-MM-DD)
- Dacă nu poți extrage un câmp, pune null ca valoare
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

    fields.push({ field_key: "banca", field_value: data.banca ?? null, confidence: data.banca ? 0.9 : 0, source_page: 1, extraction_method: "ai_haiku" });
    fields.push({ field_key: "sold_disponibil", field_value: data.sold_disponibil ?? null, confidence: data.sold_disponibil != null ? 0.9 : 0, source_page: 1, extraction_method: "ai_haiku" });
    fields.push({ field_key: "data_extras", field_value: data.data_extras ?? null, confidence: data.data_extras ? 0.9 : 0, source_page: 1, extraction_method: "ai_haiku" });
    fields.push({ field_key: "moneda_extras", field_value: data.moneda ?? null, confidence: data.moneda ? 0.9 : 0, source_page: 1, extraction_method: "ai_haiku" });
    fields.push({ field_key: "iban", field_value: data.iban ?? null, confidence: data.iban ? 0.9 : 0, source_page: 1, extraction_method: "ai_haiku" });
    fields.push({ field_key: "titular_cont", field_value: data.titular_cont ?? null, confidence: data.titular_cont ? 0.85 : 0, source_page: 1, extraction_method: "ai_haiku" });
    fields.push({ field_key: "titular_cont_cui", field_value: data.titular_cui ?? null, confidence: data.titular_cui ? 0.8 : 0, source_page: 1, extraction_method: "ai_haiku" });

    // AFIR freshness check: statement must be < 5 business days old
    if (data.data_extras) {
      const daysSince = businessDaysSince(data.data_extras);
      const isFresh = daysSince >= 0 && daysSince <= 5;

      fields.push({
        field_key: "extras_zile_lucratoare_vechime",
        field_value: daysSince,
        confidence: 0.95,
        source_page: null,
        extraction_method: "ai_haiku",
      });
      fields.push({
        field_key: "extras_afir_valid",
        field_value: isFresh,
        confidence: 0.95,
        source_page: null,
        extraction_method: "ai_haiku",
      });

      if (!isFresh) {
        fields.push({
          field_key: "extras_avertisment",
          field_value: `Extrasul de cont are ${daysSince} zile lucrătoare vechime (maxim AFIR: 5 zile lucrătoare)`,
          confidence: 0.95,
          source_page: null,
          extraction_method: "ai_haiku",
        });
      }
    }
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
