import { anthropic, withAILimit } from "../lib/anthropic";
import { safeJSONParse, splitTextIntoChunks, checkExtractionQuality } from "../lib/safeExtract";
import type { ExtractionResult } from "./extractionTypes";

/** Max chars per AI call — Sonnet handles 200K context but we stay under budget */
const CHUNK_CHAR_LIMIT = 80000;

/** Overlap pages between chunks to prevent field loss at boundaries */
const CHUNK_OVERLAP_PAGES = 2;

/** Max concurrent chunk extractions */
const MAX_CHUNK_CONCURRENCY = 3;

/**
 * Generic AI extractor — handles any document type that doesn't have
 * a dedicated extractor. Uses Claude Sonnet to identify and extract
 * all relevant structured fields from the document text.
 *
 * For documents >80K chars, splits into chunks at page boundaries
 * with 2-page overlap, processes each chunk separately, then merges
 * and deduplicates results.
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

  // For large documents, split into chunks at page boundaries and process each
  if (text.length > CHUNK_CHAR_LIMIT) {
    return extractGenericChunked(text, documentType, vocabulary, start);
  }

  return extractGenericSingle(text, documentType, vocabulary, start);
}

/**
 * Extract from a single text chunk (<=80K chars).
 */
async function extractGenericSingle(
  text: string,
  documentType: string,
  vocabulary: string[] | undefined,
  start: number,
): Promise<ExtractionResult> {
  // Build vocabulary-aware prompt section
  const vocabSection = vocabulary && vocabulary.length > 0
    ? `\n\nIMPORTANT — Folosește PREFERENȚIAL aceste chei cunoscute (vocabulary) pentru câmpuri:
${vocabulary.map(k => `- ${k}`).join("\n")}

Dacă un câmp extras corespunde uneia din cheile de mai sus, folosește EXACT acea cheie.
Dacă nu găsești o cheie potrivită, poți folosi un field_key nou descriptiv în snake_case.`
    : "";

  const systemPrompt = `Ești expert în documente oficiale românești pentru fonduri europene și proiecte de finanțare.
Primești textul unui document clasificat ca "${documentType}".

Sarcina ta: extrage TOATE datele structurate relevante din document.

Reguli:
- Returnează DOAR un JSON valid (fără backticks, fără explicații)
- Fiecare câmp extras trebuie să aibă un field_key descriptiv în snake_case (ex: "denumire_solicitant", "data_emitere", "valoare_contract")
- Folosește prefixe relevante pentru a evita coliziuni (ex: "ci_serie", "ci_numar" pentru carte de identitate)
- Dacă documentul conține tabele, extrage datele tabulare ca array-uri de obiecte
- Extrage date, sume, numere, adrese, nume, CUI/CNP, numere de înregistrare
- NU inventa date — dacă un câmp nu e în document, nu-l include
- Concentrează-te pe datele relevante pentru un proiect de finanțare${vocabSection}`;

  const fields: ExtractionResult["extracted_fields"] = [];
  const textSample = text.slice(0, 200);
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await withAILimit(() => anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 12000, // Increased from 8000 for complex documents
      system: attempt > 1
        ? `Ești expert în documente oficiale românești. Returnează EXCLUSIV un JSON valid cu structura {"fields": [...]}. Fără backticks, fără explicații.${vocabSection}`
        : systemPrompt,
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
${text.slice(0, CHUNK_CHAR_LIMIT)}`,
      }],
    }));

    const responseText = response.content[0].type === "text" ? response.content[0].text : "";
    const wasTruncated = response.stop_reason === "max_tokens";

    let fullText = responseText;

    // Handle truncation — one continuation attempt
    if (wasTruncated) {
      console.warn(`[genericExtractor] Attempt ${attempt}: truncated at ${responseText.length} chars, requesting continuation...`);

      const contResponse = await withAILimit(() => anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 12000,
        system: systemPrompt + "\n\nContinuă JSON-ul trunchiat. NU repeta ce a fost generat anterior.",
        messages: [
          {
            role: "user",
            content: `Extrage toate datele structurate din acest document. Returnează un JSON cu structura:
{
  "fields": [
    { "key": "field_key_snake_case", "value": "valoarea extrasă", "page": 1 },
    ...
  ]
}

TEXT DOCUMENT:
${text.slice(0, CHUNK_CHAR_LIMIT)}`,
          },
          { role: "assistant", content: responseText },
          { role: "user", content: "JSON-ul a fost trunchiat. Continuă EXACT de unde ai rămas:" },
        ],
      }));

      const contText = contResponse.content[0].type === "text" ? contResponse.content[0].text : "";
      fullText = responseText + contText;
      console.log(`[genericExtractor] Continuation: +${contText.length} chars (total: ${fullText.length})`);
    }

    // Parse with safe JSON parser (includes repair)
    const parsed = safeJSONParse(fullText, `genericExtractor_${documentType}`);

    if (parsed) {
      const data = parsed.data;
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

      if (parsed.repaired) {
        console.warn(`[genericExtractor] Data was repaired from truncated JSON — some fields may be incomplete for "${documentType}"`);
      }
      break; // success
    }

    console.error(
      `[genericExtractor] Attempt ${attempt}/${MAX_ATTEMPTS}: JSON parse failed for "${documentType}". ` +
      `Response length: ${fullText.length}, first 300 chars: "${fullText.slice(0, 300)}". ` +
      `Input text sample: "${textSample}"`,
    );
  }

  // Quality check
  checkExtractionQuality(`genericExtractor:${documentType}`, text.length, fields.length);

  return {
    document_type: documentType,
    extracted_fields: fields,
    raw_text: text.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}

/**
 * Extract from a large document by splitting into chunks at page boundaries
 * with overlap, processing each chunk, then merging and deduplicating results.
 */
async function extractGenericChunked(
  text: string,
  documentType: string,
  vocabulary: string[] | undefined,
  start: number,
): Promise<ExtractionResult> {
  const chunks = splitTextIntoChunks(text, CHUNK_CHAR_LIMIT, CHUNK_OVERLAP_PAGES);

  console.log(`[genericExtractor] Large document (${text.length} chars): splitting into ${chunks.length} chunks with ${CHUNK_OVERLAP_PAGES}-page overlap for "${documentType}"`);

  // Process chunks with concurrency limit — queue-based dispatch
  const allFields: ExtractionResult["extracted_fields"] = [];
  const chunkQueue = chunks.map((_, i) => i);

  async function worker() {
    let idx: number | undefined;
    while ((idx = chunkQueue.shift()) !== undefined) {
      const chunkResult = await extractGenericSingle(chunks[idx], documentType, vocabulary, Date.now());
      allFields.push(...chunkResult.extracted_fields);
    }
  }

  const workers = Array.from(
    { length: Math.min(MAX_CHUNK_CONCURRENCY, chunks.length) },
    () => worker(),
  );
  await Promise.all(workers);

  // Deduplicate by field_key + value, keep highest confidence
  const fieldMap = new Map<string, ExtractionResult["extracted_fields"][0]>();
  for (const f of allFields) {
    // Use key+value for dedup to preserve different values for same key from different pages
    const dedupKey = `${f.field_key}|${JSON.stringify(f.field_value)}`;
    const existing = fieldMap.get(dedupKey);
    if (!existing || f.confidence > existing.confidence) {
      fieldMap.set(dedupKey, f);
    }
  }

  // Also deduplicate by key alone when values are identical (from overlap)
  const keyMap = new Map<string, ExtractionResult["extracted_fields"][0]>();
  for (const f of fieldMap.values()) {
    const existing = keyMap.get(f.field_key);
    if (!existing || f.confidence > existing.confidence) {
      keyMap.set(f.field_key, f);
    }
  }

  const dedupedFields = Array.from(keyMap.values());

  console.log(
    `[genericExtractor] Chunked extraction complete: ${allFields.length} raw → ${dedupedFields.length} deduped fields from ${chunks.length} chunks`,
  );

  return {
    document_type: documentType,
    extracted_fields: dedupedFields,
    raw_text: text.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}
