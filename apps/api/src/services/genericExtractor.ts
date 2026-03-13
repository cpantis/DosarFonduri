import Anthropic from "@anthropic-ai/sdk";
import type { ExtractionResult } from "./extractionTypes";

const anthropic = new Anthropic();

/**
 * Generic AI extractor — handles any document type that doesn't have
 * a dedicated extractor. Uses Claude Sonnet to identify and extract
 * all relevant structured fields from the document text.
 *
 * When vocabulary is provided (from element_definitions), the extractor
 * maps extracted fields to known keys, ensuring consistent naming and
 * preventing data loss from key mismatches.
 */
export async function extractGeneric(
  text: string,
  documentType: string,
  vocabulary?: string[],
): Promise<ExtractionResult> {
  const start = Date.now();

  // Build vocabulary-aware prompt section
  const vocabSection = vocabulary && vocabulary.length > 0
    ? `\n\nIMPORTANT — Folosește PREFERENȚIAL aceste chei cunoscute (vocabulary) pentru câmpuri:
${vocabulary.map(k => `- ${k}`).join("\n")}

Dacă un câmp extras corespunde uneia din cheile de mai sus, folosește EXACT acea cheie.
Dacă nu găsești o cheie potrivită, poți folosi un field_key nou descriptiv în snake_case.`
    : "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: `Ești expert în documente oficiale românești pentru fonduri europene și proiecte de finanțare.
Primești textul unui document clasificat ca "${documentType}".

Sarcina ta: extrage TOATE datele structurate relevante din document.

Reguli:
- Returnează DOAR un JSON valid (fără backticks, fără explicații)
- Fiecare câmp extras trebuie să aibă un field_key descriptiv în snake_case (ex: "denumire_solicitant", "data_emitere", "valoare_contract")
- Folosește prefixe relevante pentru a evita coliziuni (ex: "ci_serie", "ci_numar" pentru carte de identitate)
- Dacă documentul conține tabele, extrage datele tabulare ca array-uri de obiecte
- Extrage date, sume, numere, adrese, nume, CUI/CNP, numere de înregistrare
- NU inventa date — dacă un câmp nu e în document, nu-l include
- Concentrează-te pe datele relevante pentru un proiect de finanțare${vocabSection}`,
    messages: [{
      role: "user",
      content: `Extrage toate datele structurate din acest document. Returnează un JSON cu structura:
{
  "fields": [
    { "key": "field_key_snake_case", "value": "valoarea extrasă", "page": 1 },
    ...
  ]
}

TEXT DOCUMENT:
${text.slice(0, 40000)}`,
    }],
  });

  const fields: ExtractionResult["extracted_fields"] = [];
  const textSample = text.slice(0, 200);
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const currentResponse = attempt === 1
      ? response
      : await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: `Ești expert în documente oficiale românești. Returnează EXCLUSIV un JSON valid cu structura {"fields": [...]}. Fără backticks, fără explicații.${vocabSection}`,
          messages: [{
            role: "user",
            content: `Extrage datele structurate din acest document "${documentType}". Returnează {"fields": [{"key": "...", "value": "...", "page": N}]}.\n\nTEXT:\n${text.slice(0, 40000)}`,
          }],
        });

    const responseText = currentResponse.content[0].type === "text" ? currentResponse.content[0].text : "";
    const cleaned = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    // Try direct parse, then regex fallback
    let data: any = null;
    try { data = JSON.parse(cleaned); } catch { /* continue */ }
    if (!data) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) { try { data = JSON.parse(match[0]); } catch { /* continue */ } }
    }

    if (data) {
      const extractedFields = Array.isArray(data.fields) ? data.fields : [];

      for (const f of extractedFields) {
        if (!f.key || f.value == null) continue;

        fields.push({
          field_key: String(f.key).replace(/[^a-z0-9_]/g, "_").slice(0, 100),
          field_value: f.value,
          confidence: vocabulary && vocabulary.length > 0 ? 0.80 : 0.75,
          source_page: typeof f.page === "number" ? f.page : null,
          extraction_method: "ai_sonnet",
        });
      }
      break; // success
    }

    console.error(
      `[genericExtractor] Attempt ${attempt}/${MAX_ATTEMPTS}: JSON parse failed for "${documentType}". ` +
      `Response length: ${responseText.length}, first 300 chars: "${responseText.slice(0, 300)}". ` +
      `Input text sample: "${textSample}"`,
    );
  }

  if (fields.length === 0) {
    console.error(`[genericExtractor] All attempts produced 0 fields for "${documentType}". Text sample: "${textSample}"`);
  }

  return {
    document_type: documentType,
    extracted_fields: fields,
    raw_text: text.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}
