import { anthropic, withAILimit } from "../lib/anthropic";
import { safeJSONParse, checkExtractionQuality } from "../lib/safeExtract";
import type { ExtractionResult } from "./extractionTypes";

export async function extractFactura(pdfText: string): Promise<ExtractionResult> {
  const start = Date.now();
  const MAX_ATTEMPTS = 2;

  const systemPrompt = `Ești expert în facturi românești pentru proiecte de finanțare europeană. Extrage datele structurate din factura primită.

REGULI:
- Prețurile pot fi în RON (LEI) sau EUR — specifică moneda corect
- TVA standard România: 19%, redus: 9%, 5%, scutit: 0%
- Dacă factura are mai multe articole, extrage-le pe TOATE
- Data facturii = "data emiterii" / "data facturii" — format ISO YYYY-MM-DD
- Numerele: "1.234.567,89" = un milion două sute... (formatul românesc)
- "Factura proforma" nu e factură fiscală — marchează tip_factura="proforma"
- Extrage IBAN-ul complet dacă e vizibil
- Extrage observațiile/mențiunile de pe factură (pot conține referințe la contracte de finanțare)
- Returnează DOAR JSON valid, fără backticks, fără explicații`;

  const userPrompt = `Extrage datele din această factură. Returnează JSON:
{
  "tip_factura": "fiscala" | "proforma" | "aviz",
  "serie_numar": "SERIE NR",
  "data_factura": "2024-06-15",
  "data_scadenta": "2024-07-15",
  "data_livrare": "2024-06-15",
  "furnizor_nume": "SC FURNIZOR SRL",
  "furnizor_cui": "RO12345678",
  "furnizor_reg_com": "J20/333/2005",
  "furnizor_adresa": "Str. X, Nr. Y, Oraș, Județ",
  "furnizor_banca": "Banca X",
  "furnizor_iban": "RO12XXXX...",
  "cumparator_nume": "SC CLIENT SRL",
  "cumparator_cui": "RO87654321",
  "cumparator_reg_com": "J02/1981/2017",
  "cumparator_adresa": "Str. Z, Nr. W",
  "articole": [
    {
      "nr_crt": 1,
      "denumire": "Serviciu consultanță",
      "descriere": "Consultanță pentru proiect",
      "um": "buc",
      "cantitate": 1,
      "pret_unitar": 5000,
      "valoare_fara_tva": 5000,
      "cota_tva": 19,
      "valoare_tva": 950,
      "valoare_totala": 5950
    }
  ],
  "total_fara_tva": 5000,
  "total_tva": 950,
  "total_de_plata": 5950,
  "moneda": "RON",
  "curs_valutar": null,
  "modalitate_plata": "transfer bancar",
  "termen_plata": "30 zile",
  "observatii": null,
  "contract_referinta": null,
  "delegat": null
}

TEXT DOCUMENT:
${pdfText.slice(0, 60000)}`;

  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 1;

    try {
      const response = await withAILimit(() => anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
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
        console.warn(`[facturaExtractor] Attempt ${attempt}: truncated at ${fullText.length} chars, requesting continuation...`);
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
        console.log(`[facturaExtractor] Continuation: +${contText.length} chars (total: ${fullText.length})`);
      }

      const parsed = safeJSONParse(fullText, "facturaExtractor");

      if (parsed) {
        const result = buildFacturaResult(parsed.data, pdfText, Date.now() - start);
        checkExtractionQuality("facturaExtractor", pdfText.length, result.extracted_fields.length);
        return result;
      }

      lastError = `JSON parse failed. Response: "${fullText.slice(0, 300)}"`;
    } catch (err: any) {
      lastError = err.message;
    }

    console.error(`[facturaExtractor] Attempt ${attempt}/${MAX_ATTEMPTS}: ${lastError}`);
  }

  console.error(`[facturaExtractor] All attempts failed: ${lastError}`);
  return {
    document_type: "factura",
    extracted_fields: [],
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}

function buildFacturaResult(data: any, pdfText: string, timeMs: number): ExtractionResult {
  const fields: ExtractionResult["extracted_fields"] = [];
  const m = "ai_sonnet";

  if (data.tip_factura) fields.push({ field_key: "tip_factura", field_value: data.tip_factura, confidence: 0.85, source_page: 1, extraction_method: m });
  if (data.serie_numar) fields.push({ field_key: "serie_numar_factura", field_value: data.serie_numar, confidence: 0.9, source_page: 1, extraction_method: m });
  if (data.data_factura) fields.push({ field_key: "data_factura", field_value: data.data_factura, confidence: 0.9, source_page: 1, extraction_method: m });
  if (data.data_scadenta) fields.push({ field_key: "data_scadenta_factura", field_value: data.data_scadenta, confidence: 0.85, source_page: 1, extraction_method: m });
  if (data.data_livrare) fields.push({ field_key: "data_livrare_factura", field_value: data.data_livrare, confidence: 0.85, source_page: 1, extraction_method: m });
  if (data.furnizor_nume) fields.push({ field_key: "furnizor_nume", field_value: data.furnizor_nume, confidence: 0.9, source_page: 1, extraction_method: m });
  if (data.furnizor_cui) fields.push({ field_key: "furnizor_cui", field_value: data.furnizor_cui, confidence: 0.9, source_page: 1, extraction_method: m });
  if (data.furnizor_reg_com) fields.push({ field_key: "furnizor_reg_com", field_value: data.furnizor_reg_com, confidence: 0.85, source_page: 1, extraction_method: m });
  if (data.furnizor_adresa) fields.push({ field_key: "furnizor_adresa", field_value: data.furnizor_adresa, confidence: 0.85, source_page: 1, extraction_method: m });
  if (data.furnizor_banca) fields.push({ field_key: "furnizor_banca", field_value: data.furnizor_banca, confidence: 0.8, source_page: 1, extraction_method: m });
  if (data.furnizor_iban) fields.push({ field_key: "furnizor_iban", field_value: data.furnizor_iban, confidence: 0.85, source_page: 1, extraction_method: m });
  if (data.cumparator_nume) fields.push({ field_key: "cumparator_nume", field_value: data.cumparator_nume, confidence: 0.9, source_page: 1, extraction_method: m });
  if (data.cumparator_cui) fields.push({ field_key: "cumparator_cui", field_value: data.cumparator_cui, confidence: 0.9, source_page: 1, extraction_method: m });
  if (data.cumparator_reg_com) fields.push({ field_key: "cumparator_reg_com", field_value: data.cumparator_reg_com, confidence: 0.85, source_page: 1, extraction_method: m });
  if (data.cumparator_adresa) fields.push({ field_key: "cumparator_adresa", field_value: data.cumparator_adresa, confidence: 0.85, source_page: 1, extraction_method: m });
  if (data.total_fara_tva != null) fields.push({ field_key: "total_fara_tva", field_value: data.total_fara_tva, confidence: 0.9, source_page: null, extraction_method: m });
  if (data.total_tva != null) fields.push({ field_key: "total_tva", field_value: data.total_tva, confidence: 0.9, source_page: null, extraction_method: m });
  if (data.total_de_plata != null) fields.push({ field_key: "total_de_plata", field_value: data.total_de_plata, confidence: 0.9, source_page: null, extraction_method: m });
  if (data.moneda) fields.push({ field_key: "moneda_factura", field_value: data.moneda, confidence: 0.9, source_page: null, extraction_method: m });
  if (data.curs_valutar != null) fields.push({ field_key: "curs_valutar", field_value: data.curs_valutar, confidence: 0.8, source_page: null, extraction_method: m });
  if (data.modalitate_plata) fields.push({ field_key: "modalitate_plata", field_value: data.modalitate_plata, confidence: 0.8, source_page: null, extraction_method: m });
  if (data.termen_plata) fields.push({ field_key: "termen_plata", field_value: data.termen_plata, confidence: 0.8, source_page: null, extraction_method: m });
  if (data.observatii) fields.push({ field_key: "observatii_factura", field_value: data.observatii, confidence: 0.75, source_page: null, extraction_method: m });
  if (data.contract_referinta) fields.push({ field_key: "contract_referinta_factura", field_value: data.contract_referinta, confidence: 0.8, source_page: null, extraction_method: m });
  if (data.delegat) fields.push({ field_key: "delegat_factura", field_value: data.delegat, confidence: 0.75, source_page: null, extraction_method: m });

  const articole = data.articole || [];
  articole.forEach((a: any, i: number) => {
    const prefix = `articol_factura_${i}`;
    if (a.denumire) fields.push({ field_key: `${prefix}_denumire`, field_value: a.denumire, confidence: 0.9, source_page: null, extraction_method: m });
    if (a.descriere) fields.push({ field_key: `${prefix}_descriere`, field_value: a.descriere, confidence: 0.8, source_page: null, extraction_method: m });
    if (a.um) fields.push({ field_key: `${prefix}_um`, field_value: a.um, confidence: 0.85, source_page: null, extraction_method: m });
    if (a.cantitate != null) fields.push({ field_key: `${prefix}_cantitate`, field_value: a.cantitate, confidence: 0.9, source_page: null, extraction_method: m });
    if (a.pret_unitar != null) fields.push({ field_key: `${prefix}_pret_unitar`, field_value: a.pret_unitar, confidence: 0.9, source_page: null, extraction_method: m });
    if (a.valoare_fara_tva != null) fields.push({ field_key: `${prefix}_valoare_fara_tva`, field_value: a.valoare_fara_tva, confidence: 0.9, source_page: null, extraction_method: m });
    if (a.cota_tva != null) fields.push({ field_key: `${prefix}_cota_tva`, field_value: a.cota_tva, confidence: 0.85, source_page: null, extraction_method: m });
    if (a.valoare_totala != null) fields.push({ field_key: `${prefix}_valoare_totala`, field_value: a.valoare_totala, confidence: 0.9, source_page: null, extraction_method: m });
  });

  fields.push({ field_key: "_raw_factura", field_value: data, confidence: 0.85, source_page: null, extraction_method: m });

  // Arithmetic validation
  if (data.total_fara_tva != null && data.total_tva != null && data.total_de_plata != null) {
    const expected = data.total_fara_tva + data.total_tva;
    const diff = Math.abs(expected - data.total_de_plata);
    if (diff > 1) {
      fields.push({
        field_key: "_validation_total_mismatch",
        field_value: `total_fara_tva(${data.total_fara_tva}) + total_tva(${data.total_tva}) = ${expected} ≠ total_de_plata(${data.total_de_plata})`,
        confidence: 0.95,
        source_page: null,
        extraction_method: "validation",
      });
    }
  }

  return {
    document_type: "factura",
    extracted_fields: fields,
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: timeMs,
  };
}
