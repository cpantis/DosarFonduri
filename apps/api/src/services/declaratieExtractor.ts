import { anthropic, withAILimit } from "../lib/anthropic";
import type { ExtractionResult } from "./extractionTypes";

/**
 * Extracts structured data from "declarație expert contabil" documents.
 * These certify the company's agri-food activity history.
 */
export async function extractDeclaratie(pdfText: string): Promise<ExtractionResult> {
  const start = Date.now();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: `Ești expert în documente financiar-contabile românești. Extrage datele din declarația expertului contabil privind activitatea agroalimentară a firmei.

IMPORTANT:
- Declarația atestă anii de activitate în domeniul agroalimentar
- Codurile CAEN relevante sunt cele agroalimentare (01xx, 02xx, 10xx, 11xx, etc.)
- Ponderea veniturilor = procentul veniturilor din activitate agroalimentară din total
- Aceste date determină punctajul la criteriul CS3 (vechime în activitate)
- Dacă nu poți extrage un câmp, pune null ca valoare
- Returnează DOAR JSON valid, fără backticks, fără explicații`,
    messages: [{
      role: "user",
      content: `Extrage datele din această declarație de expert contabil. Returnează JSON:
{
  "ani_activitate_agroalimentara": 5,
  "coduri_caen_activitate": ["0111", "0112", "1061"],
  "cifra_afaceri_agroalimentara": 2500000,
  "cifra_afaceri_totala": 3000000,
  "ponderea_venituri_agro_in_total": 83.3,
  "ani_detaliati": [
    { "an": 2023, "cifra_afaceri_agro": 800000, "cifra_afaceri_total": 950000, "pondere": 84.2 },
    { "an": 2022, "cifra_afaceri_agro": 750000, "cifra_afaceri_total": 900000, "pondere": 83.3 }
  ],
  "expert_nume": "Ion Popescu",
  "expert_nr_autorizatie": "12345",
  "data_declaratie": "2024-06-01",
  "firma_nume": "SC Exemplu SRL",
  "firma_cui": "1234567"
}

TEXT DOCUMENT:
${pdfText.slice(0, 40000)}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const fields: ExtractionResult["extracted_fields"] = [];

  try {
    const data = JSON.parse(cleaned);

    fields.push({ field_key: "ani_activitate_agroalimentara", field_value: data.ani_activitate_agroalimentara ?? null, confidence: data.ani_activitate_agroalimentara != null ? 0.9 : 0, source_page: 1, extraction_method: "ai_sonnet" });
    fields.push({ field_key: "coduri_caen_activitate", field_value: data.coduri_caen_activitate ?? null, confidence: data.coduri_caen_activitate ? 0.85 : 0, source_page: null, extraction_method: "ai_sonnet" });
    fields.push({ field_key: "cifra_afaceri_agroalimentara", field_value: data.cifra_afaceri_agroalimentara ?? null, confidence: data.cifra_afaceri_agroalimentara != null ? 0.85 : 0, source_page: null, extraction_method: "ai_sonnet" });
    fields.push({ field_key: "cifra_afaceri_totala", field_value: data.cifra_afaceri_totala ?? null, confidence: data.cifra_afaceri_totala != null ? 0.85 : 0, source_page: null, extraction_method: "ai_sonnet" });
    fields.push({ field_key: "ponderea_venituri_agro_in_total", field_value: data.ponderea_venituri_agro_in_total ?? null, confidence: data.ponderea_venituri_agro_in_total != null ? 0.85 : 0, source_page: null, extraction_method: "ai_sonnet" });
    fields.push({ field_key: "expert_contabil_nume", field_value: data.expert_nume ?? null, confidence: data.expert_nume ? 0.9 : 0, source_page: 1, extraction_method: "ai_sonnet" });
    fields.push({ field_key: "expert_contabil_autorizatie", field_value: data.expert_nr_autorizatie ?? null, confidence: data.expert_nr_autorizatie ? 0.85 : 0, source_page: 1, extraction_method: "ai_sonnet" });
    fields.push({ field_key: "data_declaratie_expert", field_value: data.data_declaratie ?? null, confidence: data.data_declaratie ? 0.9 : 0, source_page: 1, extraction_method: "ai_sonnet" });
    fields.push({ field_key: "firma_nume", field_value: data.firma_nume ?? null, confidence: data.firma_nume ? 0.85 : 0, source_page: null, extraction_method: "ai_sonnet" });
    fields.push({ field_key: "firma_cui", field_value: data.firma_cui ?? null, confidence: data.firma_cui ? 0.85 : 0, source_page: null, extraction_method: "ai_sonnet" });

    if (data.ani_detaliati) fields.push({ field_key: "_raw_ani_detaliati", field_value: data.ani_detaliati, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  } catch {
    console.error("Failed to parse declaratie expert contabil extraction JSON");
  }

  return {
    document_type: "declaratie_expert_contabil",
    extracted_fields: fields,
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}
