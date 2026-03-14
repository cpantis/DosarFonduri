import { anthropic, withAILimit } from "../lib/anthropic";
import type { ExtractionResult } from "./extractionTypes";

/**
 * Extracts structured data from Act Constitutiv (Articles of Association).
 * Complements ONRC extraction — captures clauses, restrictions, and
 * governance details not always present in the Certificat Constatator.
 */
export async function extractActConstitutiv(pdfText: string): Promise<ExtractionResult> {
  const start = Date.now();

  const response = await withAILimit(() => anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 6000,
    system: `Ești expert în acte constitutive ale societăților comerciale din România. Extrage datele structurate din actul constitutiv primit.

REGULI:
- Identifică forma juridică (SRL, SA, SNC, SCS, etc.)
- Extrage clauzele despre cesiune, retragere, dizolvare
- Extrage restricțiile de activitate dacă există
- Obiectul de activitate = CAEN principal + secundare
- Returnează DOAR JSON valid, fără backticks, fără explicații`,
    messages: [{
      role: "user",
      content: `Extrage datele din acest act constitutiv. Returnează JSON:
{
  "denumire_societate": "SC EXEMPLU SRL",
  "forma_juridica": "SRL",
  "sediu_social": "Str. X, Nr. Y, Oraș, Județ",
  "capital_social": 200,
  "moneda": "RON",
  "nr_parti_sociale": 20,
  "valoare_parte_sociala": 10,
  "durata_societate": "nelimitată",
  "obiect_principal": { "cod_caen": "0111", "descriere": "Cultivarea cerealelor" },
  "obiecte_secundare": [
    { "cod_caen": "0112", "descriere": "Cultivarea orezului" }
  ],
  "asociati": [
    {
      "nume": "POPESCU ION",
      "tip": "pf",
      "aport": 200,
      "parti_sociale": 20,
      "procent": 100,
      "cetatenie": "română"
    }
  ],
  "administrator": {
    "nume": "POPESCU ION",
    "puteri": "depline",
    "mandat": "nelimitat"
  },
  "clauze_cesiune": "Cesiunea părților sociale se face cu acordul asociaților",
  "clauze_retragere": "Asociatul se poate retrage conform art. 226 din Legea 31/1990",
  "clauze_dizolvare": "Societatea se dizolvă în cazurile prevăzute de lege",
  "restrictii_activitate": null,
  "adunare_generala": "Deciziile se iau cu majoritate simplă",
  "exercitiu_financiar": "1 ianuarie - 31 decembrie",
  "repartizare_profit": "Proporțional cu participarea la capital"
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

    if (data.denumire_societate) fields.push({ field_key: "denumire_societate", field_value: data.denumire_societate, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.forma_juridica) fields.push({ field_key: "forma_juridica_ac", field_value: data.forma_juridica, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.sediu_social) fields.push({ field_key: "sediu_social", field_value: data.sediu_social, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
    if (data.capital_social != null) fields.push({ field_key: "capital_social_ac", field_value: data.capital_social, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
    if (data.nr_parti_sociale != null) fields.push({ field_key: "nr_parti_sociale_ac", field_value: data.nr_parti_sociale, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
    if (data.valoare_parte_sociala != null) fields.push({ field_key: "valoare_parte_sociala", field_value: data.valoare_parte_sociala, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
    if (data.durata_societate) fields.push({ field_key: "durata_societate", field_value: data.durata_societate, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });

    if (data.obiect_principal) {
      fields.push({ field_key: "caen_principal_ac", field_value: data.obiect_principal.cod_caen, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
      fields.push({ field_key: "descriere_caen_principal_ac", field_value: data.obiect_principal.descriere, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
    }

    if (data.obiecte_secundare?.length) {
      fields.push({ field_key: "obiecte_secundare_ac", field_value: data.obiecte_secundare, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
    }

    const asociati = data.asociati || [];
    asociati.forEach((a: any, i: number) => {
      const prefix = `asociat_ac_${i}`;
      if (a.nume) fields.push({ field_key: `${prefix}_nume`, field_value: a.nume, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
      if (a.aport != null) fields.push({ field_key: `${prefix}_aport`, field_value: a.aport, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
      if (a.procent != null) fields.push({ field_key: `${prefix}_procent`, field_value: a.procent, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
    });

    if (data.administrator) fields.push({ field_key: "administrator_ac", field_value: data.administrator, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
    if (data.clauze_cesiune) fields.push({ field_key: "clauze_cesiune", field_value: data.clauze_cesiune, confidence: 0.8, source_page: null, extraction_method: "ai_sonnet" });
    if (data.clauze_retragere) fields.push({ field_key: "clauze_retragere", field_value: data.clauze_retragere, confidence: 0.8, source_page: null, extraction_method: "ai_sonnet" });
    if (data.clauze_dizolvare) fields.push({ field_key: "clauze_dizolvare", field_value: data.clauze_dizolvare, confidence: 0.8, source_page: null, extraction_method: "ai_sonnet" });
    if (data.restrictii_activitate) fields.push({ field_key: "restrictii_activitate", field_value: data.restrictii_activitate, confidence: 0.8, source_page: null, extraction_method: "ai_sonnet" });
    if (data.repartizare_profit) fields.push({ field_key: "repartizare_profit", field_value: data.repartizare_profit, confidence: 0.8, source_page: null, extraction_method: "ai_sonnet" });

    fields.push({ field_key: "_raw_act_constitutiv", field_value: data, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  } catch {
    console.error("[actConstitutivExtractor] Failed to parse extraction JSON");
  }

  return {
    document_type: "act_constitutiv",
    extracted_fields: fields,
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}
