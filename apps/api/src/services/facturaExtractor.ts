import { anthropic, withAILimit } from "../lib/anthropic";
import type { ExtractionResult } from "./extractionTypes";

/**
 * Extracts structured data from Romanian invoices (facturi).
 * Handles facturi fiscale, facturi proforma, and avize de însoțire.
 */
export async function extractFactura(pdfText: string): Promise<ExtractionResult> {
  const start = Date.now();

  const response = await withAILimit(() => anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 6000,
    system: `Ești expert în facturi românești. Extrage datele structurate din factura primită.

REGULI:
- Prețurile pot fi în RON (LEI) sau EUR
- TVA standard România: 19%, redus: 9%, 5%
- Dacă factura are mai multe articole, extrage-le pe toate
- Data facturii poate fi "data emiterii" / "data facturii"
- Returnează DOAR JSON valid, fără backticks, fără explicații`,
    messages: [{
      role: "user",
      content: `Extrage datele din această factură. Returnează JSON:
{
  "serie_numar": "SERIE NR",
  "data_factura": "2024-06-15",
  "data_scadenta": "2024-07-15",
  "furnizor_nume": "SC FURNIZOR SRL",
  "furnizor_cui": "RO12345678",
  "furnizor_reg_com": "J20/333/2005",
  "furnizor_adresa": "Str. X, Nr. Y, Oraș, Județ",
  "furnizor_banca": "Banca / IBAN",
  "cumparator_nume": "SC CLIENT SRL",
  "cumparator_cui": "RO87654321",
  "cumparator_adresa": "Str. Z, Nr. W",
  "articole": [
    {
      "denumire": "Serviciu consultanță",
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
  "observatii": null
}

TEXT DOCUMENT:
${pdfText.slice(0, 60000)}`,
    }],
  }));

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const fields: ExtractionResult["extracted_fields"] = [];

  try {
    const data = JSON.parse(cleaned);

    if (data.serie_numar) fields.push({ field_key: "serie_numar_factura", field_value: data.serie_numar, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.data_factura) fields.push({ field_key: "data_factura", field_value: data.data_factura, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.data_scadenta) fields.push({ field_key: "data_scadenta_factura", field_value: data.data_scadenta, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.furnizor_nume) fields.push({ field_key: "furnizor_nume", field_value: data.furnizor_nume, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.furnizor_cui) fields.push({ field_key: "furnizor_cui", field_value: data.furnizor_cui, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.furnizor_reg_com) fields.push({ field_key: "furnizor_reg_com", field_value: data.furnizor_reg_com, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.furnizor_adresa) fields.push({ field_key: "furnizor_adresa", field_value: data.furnizor_adresa, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.furnizor_banca) fields.push({ field_key: "furnizor_banca", field_value: data.furnizor_banca, confidence: 0.8, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.cumparator_nume) fields.push({ field_key: "cumparator_nume", field_value: data.cumparator_nume, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.cumparator_cui) fields.push({ field_key: "cumparator_cui", field_value: data.cumparator_cui, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.cumparator_adresa) fields.push({ field_key: "cumparator_adresa", field_value: data.cumparator_adresa, confidence: 0.85, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.total_fara_tva != null) fields.push({ field_key: "total_fara_tva", field_value: data.total_fara_tva, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
    if (data.total_tva != null) fields.push({ field_key: "total_tva", field_value: data.total_tva, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
    if (data.total_de_plata != null) fields.push({ field_key: "total_de_plata", field_value: data.total_de_plata, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
    if (data.moneda) fields.push({ field_key: "moneda_factura", field_value: data.moneda, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
    if (data.curs_valutar != null) fields.push({ field_key: "curs_valutar", field_value: data.curs_valutar, confidence: 0.8, source_page: null, extraction_method: "ai_sonnet" });
    if (data.modalitate_plata) fields.push({ field_key: "modalitate_plata", field_value: data.modalitate_plata, confidence: 0.8, source_page: null, extraction_method: "ai_sonnet" });

    const articole = data.articole || [];
    articole.forEach((a: any, i: number) => {
      const prefix = `articol_factura_${i}`;
      if (a.denumire) fields.push({ field_key: `${prefix}_denumire`, field_value: a.denumire, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
      if (a.cantitate != null) fields.push({ field_key: `${prefix}_cantitate`, field_value: a.cantitate, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
      if (a.pret_unitar != null) fields.push({ field_key: `${prefix}_pret_unitar`, field_value: a.pret_unitar, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
      if (a.valoare_fara_tva != null) fields.push({ field_key: `${prefix}_valoare_fara_tva`, field_value: a.valoare_fara_tva, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
      if (a.cota_tva != null) fields.push({ field_key: `${prefix}_cota_tva`, field_value: a.cota_tva, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (a.valoare_totala != null) fields.push({ field_key: `${prefix}_valoare_totala`, field_value: a.valoare_totala, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
    });

    fields.push({ field_key: "_raw_factura", field_value: data, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  } catch {
    console.error("[facturaExtractor] Failed to parse extraction JSON");
  }

  return {
    document_type: "factura",
    extracted_fields: fields,
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}
