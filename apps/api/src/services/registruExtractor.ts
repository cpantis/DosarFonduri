import Anthropic from "@anthropic-ai/sdk";
import type { ExtractionResult } from "./extractionTypes";

const anthropic = new Anthropic();

/**
 * Check if a tractor is older than 8 years (excluded from Anexa 3 calculation).
 */
function isTractorExcluded(anAchizitie: number): boolean {
  const currentYear = new Date().getFullYear();
  return (currentYear - anAchizitie) > 8;
}

/**
 * Extracts structured data from "registru imobilizări" (fixed assets register) documents.
 * Uses Sonnet for accurate equipment data extraction.
 *
 * Automatically calculates whether tractors are >8 years old (excluded from Anexa 3).
 */
export async function extractRegistruImobilizari(pdfText: string): Promise<ExtractionResult> {
  const start = Date.now();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 6000,
    system: `Ești expert în contabilitate românească. Extrage registrul de imobilizări corporale (mijloace fixe) din documentul primit.

IMPORTANT:
- Concentrează-te pe echipamente agricole: tractoare, combine, semănători, pluguri, etc.
- Puterea în CP (cai putere) e relevantă doar pentru tractoare și combine
- Categorie poate fi: "tractor", "combina", "utilaj_agricol", "vehicul", "echipament_irigat", "altele"
- Valorile sunt în LEI
- Dacă nu poți extrage un câmp, pune null ca valoare
- Returnează DOAR JSON valid, fără backticks, fără explicații`,
    messages: [{
      role: "user",
      content: `Extrage lista de imobilizări corporale. Returnează JSON:
{
  "echipamente": [
    {
      "denumire": "Tractor New Holland T7.210",
      "nr_inventar": "2145",
      "an_achizitie": 2019,
      "valoare_inventar": 450000,
      "amortizare_cumulata": 180000,
      "valoare_ramasa": 270000,
      "putere_cp": 210,
      "stare": "functional",
      "categorie": "tractor"
    }
  ],
  "total_valoare_inventar": 2500000,
  "total_amortizare": 1000000,
  "data_registru": "2024-12-31"
}

TEXT DOCUMENT:
${pdfText.slice(0, 80000)}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const fields: ExtractionResult["extracted_fields"] = [];

  try {
    const data = JSON.parse(cleaned);

    fields.push({ field_key: "total_valoare_inventar", field_value: data.total_valoare_inventar ?? null, confidence: data.total_valoare_inventar != null ? 0.85 : 0, source_page: null, extraction_method: "ai_sonnet" });
    fields.push({ field_key: "total_amortizare", field_value: data.total_amortizare ?? null, confidence: data.total_amortizare != null ? 0.85 : 0, source_page: null, extraction_method: "ai_sonnet" });
    fields.push({ field_key: "data_registru", field_value: data.data_registru ?? null, confidence: data.data_registru ? 0.8 : 0, source_page: 1, extraction_method: "ai_sonnet" });

    const echipamente = data.echipamente || [];

    // Calculate aggregate tractor metrics for Anexa 3
    let putereTractoarEligibile = 0;
    let putereTractoarExcluse = 0;
    const tractoareExcluse: string[] = [];

    echipamente.forEach((e: any, i: number) => {
      const prefix = `echipament_${i}`;
      fields.push({ field_key: `${prefix}_denumire`, field_value: e.denumire ?? null, confidence: e.denumire ? 0.85 : 0, source_page: null, extraction_method: "ai_sonnet" });
      fields.push({ field_key: `${prefix}_an_achizitie`, field_value: e.an_achizitie ?? null, confidence: e.an_achizitie != null ? 0.85 : 0, source_page: null, extraction_method: "ai_sonnet" });
      fields.push({ field_key: `${prefix}_valoare_inventar`, field_value: e.valoare_inventar ?? null, confidence: e.valoare_inventar != null ? 0.85 : 0, source_page: null, extraction_method: "ai_sonnet" });
      fields.push({ field_key: `${prefix}_putere_cp`, field_value: e.putere_cp ?? null, confidence: e.putere_cp != null ? 0.8 : 0, source_page: null, extraction_method: "ai_sonnet" });
      fields.push({ field_key: `${prefix}_stare`, field_value: e.stare ?? null, confidence: e.stare ? 0.75 : 0, source_page: null, extraction_method: "ai_sonnet" });
      fields.push({ field_key: `${prefix}_categorie`, field_value: e.categorie ?? null, confidence: e.categorie ? 0.8 : 0, source_page: null, extraction_method: "ai_sonnet" });

      // Tractor age calculation for Anexa 3
      if (e.categorie === "tractor" && e.putere_cp && e.an_achizitie) {
        const excluded = isTractorExcluded(e.an_achizitie);
        fields.push({
          field_key: `${prefix}_exclus_anexa3`,
          field_value: excluded,
          confidence: 0.95,
          source_page: null,
          extraction_method: "ai_sonnet",
        });
        fields.push({
          field_key: `${prefix}_vechime_ani`,
          field_value: new Date().getFullYear() - e.an_achizitie,
          confidence: 0.95,
          source_page: null,
          extraction_method: "ai_sonnet",
        });

        if (excluded) {
          putereTractoarExcluse += e.putere_cp;
          tractoareExcluse.push(e.denumire || `Tractor #${i}`);
        } else {
          putereTractoarEligibile += e.putere_cp;
        }
      }
    });

    // Aggregate tractor power fields (useful for cross-validation in Annexa 3)
    fields.push({
      field_key: "putere_tractoare_existente",
      field_value: putereTractoarEligibile,
      confidence: echipamente.length > 0 ? 0.85 : 0,
      source_page: null,
      extraction_method: "ai_sonnet",
    });
    fields.push({
      field_key: "putere_tractoare_excluse_8ani",
      field_value: putereTractoarExcluse,
      confidence: echipamente.length > 0 ? 0.85 : 0,
      source_page: null,
      extraction_method: "ai_sonnet",
    });

    if (tractoareExcluse.length > 0) {
      fields.push({
        field_key: "tractoare_excluse_lista",
        field_value: tractoareExcluse,
        confidence: 0.85,
        source_page: null,
        extraction_method: "ai_sonnet",
      });
    }

    fields.push({ field_key: "_raw_echipamente", field_value: echipamente, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  } catch {
    console.error("Failed to parse registru imobilizari extraction JSON");
  }

  return {
    document_type: "registru_imobilizari",
    extracted_fields: fields,
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}
