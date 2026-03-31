import { anthropic, withAILimit } from "../lib/anthropic";
import { safeJSONParse, checkExtractionQuality } from "../lib/safeExtract";
import type { ExtractionResult } from "./extractionTypes";

/**
 * Extracts structured data from "ofertă de preț" (price quote) documents.
 * Uses Sonnet for accurate technical specification extraction.
 */
export async function extractOferta(pdfText: string): Promise<ExtractionResult> {
  const start = Date.now();
  const MAX_ATTEMPTS = 2;

  const systemPrompt = `Ești expert în oferte de preț pentru echipamente agricole/industriale. Extrage datele structurate din oferta primită.

IMPORTANT:
- Prețurile sunt în EUR dacă nu se specifică altfel
- este_no_till = true dacă echipamentul e de tip no-till/direct seeding/minimum-till
- Extrage specificațiile tehnice EXACTE, inclusiv dacă menționează tehnologia no-till/minimum-till
- Dacă nu poți extrage un câmp, pune null ca valoare
- Returnează DOAR JSON valid, fără backticks, fără explicații`;

  const userPrompt = `Extrage datele din această ofertă de preț. Returnează JSON:
{
  "furnizor_nume": "Numele furnizorului",
  "furnizor_cui": "1234567",
  "furnizor_adresa": "Adresa",
  "articole": [
    {
      "utilaj_denumire": "Tractor John Deere 6130R",
      "specificatii_tehnice": "130 CP, 4WD, cabină AC",
      "pret_unitar_eur": 85000,
      "cantitate": 1,
      "pret_total_eur": 85000,
      "este_no_till": false
    }
  ],
  "total_oferta_eur": 85000,
  "valabilitate_oferta": "30 zile",
  "data_oferta": "2024-06-15",
  "nr_oferta": "OF-123/2024"
}

TEXT DOCUMENT:
${pdfText.slice(0, 100000)}`;

  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 1;

    try {
      const response = await withAILimit(() => anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8000, // Increased from 4000 for multi-item quotes
        system: isRetry
          ? systemPrompt + "\n\nATENȚIE: Răspunsul tău anterior NU a fost JSON valid. Returnează EXCLUSIV un obiect JSON valid."
          : systemPrompt,
        messages: [{
          role: "user",
          content: userPrompt,
        }],
      }));

      let fullText = response.content?.[0]?.type === "text" ? response.content[0].text : "";

      // Handle truncation
      if (response.stop_reason === "max_tokens") {
        console.warn(`[ofertaExtractor] Attempt ${attempt}: truncated at ${fullText.length} chars, requesting continuation...`);
        const contResponse = await withAILimit(() => anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 8000,
          system: systemPrompt + "\n\nContinuă JSON-ul trunchiat. NU repeta ce a fost generat anterior.",
          messages: [
            { role: "user", content: userPrompt },
            { role: "assistant", content: fullText },
            { role: "user", content: "JSON-ul a fost trunchiat. Continuă EXACT de unde ai rămas:" },
          ],
        }));
        const contText = contResponse.content?.[0]?.type === "text" ? contResponse.content[0].text : "";
        fullText += contText;
        console.log(`[ofertaExtractor] Continuation: +${contText.length} chars (total: ${fullText.length})`);
      }

      const parsed = safeJSONParse(fullText, "ofertaExtractor");

      if (parsed) {
        return buildOfertaResult(parsed.data, pdfText, Date.now() - start);
      }

      lastError = `JSON parse failed. Response: "${fullText.slice(0, 300)}"`;
    } catch (err: any) {
      lastError = err.message;
    }

    console.error(`[ofertaExtractor] Attempt ${attempt}/${MAX_ATTEMPTS}: ${lastError}`);
  }

  console.error(`[ofertaExtractor] All attempts failed: ${lastError}`);
  return {
    document_type: "oferta_pret",
    extracted_fields: [],
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}

function buildOfertaResult(data: any, pdfText: string, timeMs: number): ExtractionResult {
  const fields: ExtractionResult["extracted_fields"] = [];
  const m = "ai_sonnet";

  fields.push({ field_key: "furnizor_nume", field_value: data.furnizor_nume ?? null, confidence: data.furnizor_nume ? 0.9 : 0, source_page: 1, extraction_method: m });
  fields.push({ field_key: "furnizor_cui", field_value: data.furnizor_cui ?? null, confidence: data.furnizor_cui ? 0.85 : 0, source_page: 1, extraction_method: m });
  fields.push({ field_key: "total_oferta_eur", field_value: data.total_oferta_eur ?? null, confidence: data.total_oferta_eur != null ? 0.9 : 0, source_page: null, extraction_method: m });
  fields.push({ field_key: "valabilitate_oferta", field_value: data.valabilitate_oferta ?? null, confidence: data.valabilitate_oferta ? 0.8 : 0, source_page: null, extraction_method: m });
  fields.push({ field_key: "data_oferta", field_value: data.data_oferta ?? null, confidence: data.data_oferta ? 0.85 : 0, source_page: 1, extraction_method: m });
  fields.push({ field_key: "nr_oferta", field_value: data.nr_oferta ?? null, confidence: data.nr_oferta ? 0.85 : 0, source_page: 1, extraction_method: m });

  const articole = data.articole || [];
  articole.forEach((a: any, i: number) => {
    const prefix = `articol_${i}`;
    fields.push({ field_key: `${prefix}_utilaj_denumire`, field_value: a.utilaj_denumire ?? null, confidence: a.utilaj_denumire ? 0.9 : 0, source_page: null, extraction_method: m });
    fields.push({ field_key: `${prefix}_specificatii_tehnice`, field_value: a.specificatii_tehnice ?? null, confidence: a.specificatii_tehnice ? 0.8 : 0, source_page: null, extraction_method: m });
    if (a.pret_unitar_eur != null) fields.push({ field_key: `${prefix}_pret_unitar_eur`, field_value: a.pret_unitar_eur, confidence: 0.9, source_page: null, extraction_method: m });
    if (a.pret_total_eur != null) fields.push({ field_key: `${prefix}_pret_total_eur`, field_value: a.pret_total_eur, confidence: 0.9, source_page: null, extraction_method: m });
    fields.push({ field_key: `${prefix}_este_no_till`, field_value: a.este_no_till ?? null, confidence: a.este_no_till != null ? 0.75 : 0, source_page: null, extraction_method: m });
  });

  fields.push({ field_key: "_raw_articole", field_value: articole, confidence: 0.85, source_page: null, extraction_method: m });

  checkExtractionQuality("ofertaExtractor", pdfText.length, fields.length);

  return {
    document_type: "oferta_pret",
    extracted_fields: fields,
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: timeMs,
  };
}
