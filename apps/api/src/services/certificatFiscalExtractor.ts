import { anthropic, withAILimit } from "../lib/anthropic";
import { safeJSONParse } from "../lib/safeExtract";
import type { ExtractionResult } from "./extractionTypes";

export async function extractCertificatFiscal(text: string): Promise<ExtractionResult> {
  const start = Date.now();
  const MAX_ATTEMPTS = 2;

  const systemPrompt = `Ești expert în certificate fiscale românești emise de ANAF sau Primării.
Extrage datele structurate din certificatul fiscal primit.

IMPORTANT:
- Certificatele de la ANAF = buget de stat (obligații către stat)
- Certificatele de la Primărie/DITL = buget local (taxe locale, impozite)
- Data valabilității e critică — certificatele expiră de obicei la 30 zile
- Obligații restante = orice sumă neachitată la data emiterii
- Extrage SUMA exactă a restanțelor dacă există
- Extrage toate detaliile emitentului (ANAF/DGRFP, Primăria)
- Returnează DOAR JSON valid, fără backticks, fără explicații`;

  const userPrompt = `Extrage datele din acest certificat fiscal:

${text.slice(0, 15000)}

Returnează un singur obiect JSON:
{
  "denumire_contribuabil": "...",
  "cui": "...",
  "adresa_fiscala": "...",
  "nr_certificat": "...",
  "data_emitere": "YYYY-MM-DD",
  "data_valabilitate": "YYYY-MM-DD",
  "emitent": "ANAF - DGRFP Timișoara",
  "tip_emitent": "anaf" | "primarie",
  "obligatii_restante": true/false,
  "suma_restanta": null or number,
  "detalii_restante": null or "descriere restanțe",
  "tip_obligatii": "buget_stat" | "buget_local" | "ambele",
  "scop": "Finanțare europeană" (dacă menționat)
}`;

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await withAILimit(() => anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: attempt > 1
          ? systemPrompt + "\n\nATENȚIE: Returnează EXCLUSIV JSON valid."
          : systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }));

      const responseText = response.content[0].type === "text" ? response.content[0].text : "{}";
      const parsed = safeJSONParse(responseText, "certificatFiscalExtractor");

      if (parsed) {
        return buildCertificatResult(parsed.data, text, Date.now() - start);
      }

      lastError = `JSON parse failed: "${responseText.slice(0, 200)}"`;
    } catch (err: any) {
      lastError = err.message;
    }
    console.error(`[certificatFiscalExtractor] Attempt ${attempt}/${MAX_ATTEMPTS}: ${lastError}`);
  }

  return {
    document_type: "certificat_fiscal",
    extracted_fields: [],
    raw_text: text.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}

function buildCertificatResult(parsed: any, text: string, timeMs: number): ExtractionResult {
  const fields: ExtractionResult["extracted_fields"] = [];
  const m = "ai_sonnet";

  if (parsed.denumire_contribuabil) fields.push({ field_key: "denumire_contribuabil", field_value: parsed.denumire_contribuabil, confidence: 0.9, source_page: 1, extraction_method: m });
  if (parsed.cui) fields.push({ field_key: "cui_fiscal", field_value: parsed.cui, confidence: 0.9, source_page: 1, extraction_method: m });
  if (parsed.adresa_fiscala) fields.push({ field_key: "adresa_fiscala", field_value: parsed.adresa_fiscala, confidence: 0.85, source_page: 1, extraction_method: m });
  if (parsed.nr_certificat) fields.push({ field_key: "nr_certificat_fiscal", field_value: parsed.nr_certificat, confidence: 0.9, source_page: 1, extraction_method: m });
  if (parsed.data_emitere) fields.push({ field_key: "data_emitere_certificat_fiscal", field_value: parsed.data_emitere, confidence: 0.9, source_page: 1, extraction_method: m });
  if (parsed.data_valabilitate) fields.push({ field_key: "data_valabilitate_certificat_fiscal", field_value: parsed.data_valabilitate, confidence: 0.85, source_page: 1, extraction_method: m });
  if (parsed.emitent) fields.push({ field_key: "emitent_certificat_fiscal", field_value: parsed.emitent, confidence: 0.85, source_page: 1, extraction_method: m });
  if (parsed.tip_emitent) fields.push({ field_key: "tip_emitent_certificat_fiscal", field_value: parsed.tip_emitent, confidence: 0.85, source_page: 1, extraction_method: m });
  fields.push({ field_key: "obligatii_restante", field_value: !!parsed.obligatii_restante, confidence: 0.9, source_page: 1, extraction_method: m });
  if (parsed.suma_restanta != null) fields.push({ field_key: "suma_restanta_fiscala", field_value: parsed.suma_restanta, confidence: 0.85, source_page: 1, extraction_method: m });
  if (parsed.detalii_restante) fields.push({ field_key: "detalii_restante_fiscale", field_value: parsed.detalii_restante, confidence: 0.8, source_page: null, extraction_method: m });
  if (parsed.tip_obligatii) fields.push({ field_key: "tip_obligatii_fiscale", field_value: parsed.tip_obligatii, confidence: 0.85, source_page: 1, extraction_method: m });
  if (parsed.scop) fields.push({ field_key: "scop_certificat_fiscal", field_value: parsed.scop, confidence: 0.8, source_page: null, extraction_method: m });

  // Validity check
  if (parsed.data_valabilitate) {
    const valDate = new Date(parsed.data_valabilitate);
    const now = new Date();
    const isValid = valDate >= now;
    fields.push({
      field_key: "certificat_fiscal_valid",
      field_value: isValid,
      confidence: 0.95,
      source_page: null,
      extraction_method: "validation",
    });
    if (!isValid) {
      fields.push({
        field_key: "certificat_fiscal_avertisment",
        field_value: `Certificatul fiscal a expirat la ${parsed.data_valabilitate}`,
        confidence: 0.95,
        source_page: null,
        extraction_method: "validation",
      });
    }
  }

  fields.push({ field_key: "_raw_certificat_fiscal", field_value: parsed, confidence: 0.85, source_page: null, extraction_method: m });

  return {
    document_type: "certificat_fiscal",
    extracted_fields: fields,
    raw_text: text.slice(0, 5000),
    processing_time_ms: timeMs,
  };
}
