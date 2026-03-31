import { anthropic, withAILimit } from "../lib/anthropic";
import { safeJSONParse, checkExtractionQuality } from "../lib/safeExtract";
import type { ExtractionResult } from "./extractionTypes";

export async function extractContract(pdfText: string): Promise<ExtractionResult> {
  const start = Date.now();
  const MAX_ATTEMPTS = 2;

  const systemPrompt = `Ești expert în contracte românești relevante pentru proiecte de finanțare europeană. Extrage datele structurate din contractul primit.

IMPORTANT:
- Identifică TIPUL contractului: arenda, vanzare_cumparare, prestari_servicii, comodat, inchiriere, asociere, cesiune, altul
- Un contract poate avea MULTIPLE parcele/bunuri/servicii — returnează array complet
- Suprafața agricolă e în hectare (ha), suprafața construcții e în mp
- Datele trebuie să fie în format ISO (YYYY-MM-DD)
- Sumele pot fi în RON sau EUR — specifică moneda
- Extrage TOȚI semnatarii/părțile contractuale cu rolul lor
- Extrage clauzele speciale (condiții rezolutorii, garanții, penalități)
- Dacă nu poți extrage un câmp, pune null ca valoare
- Returnează DOAR JSON valid, fără backticks, fără explicații`;

  const userPrompt = `Extrage datele din acest contract. Returnează JSON cu structura:
{
  "tip_contract": "arenda" | "vanzare_cumparare" | "prestari_servicii" | "comodat" | "inchiriere" | "asociere" | "altul",
  "nr_contract": "123/2024",
  "data_contract": "2024-01-01",
  "data_start": "2024-01-01",
  "data_sfarsit": "2029-01-01",
  "durata": "5 ani",
  "parti": [
    {
      "rol": "arendator" | "arenda" | "vanzator" | "cumparator" | "prestator" | "beneficiar" | "comodant" | "comodatar" | "locator" | "locatar",
      "nume": "Nume complet",
      "tip": "pf" | "pj",
      "cui_cnp": "1234567",
      "adresa": "Str. X, Nr. Y"
    }
  ],
  "obiect": "Descrierea obiectului contractului",
  "bunuri": [
    {
      "descriere": "Teren agricol / Echipament / Serviciu",
      "locatie": "UAT / adresă",
      "suprafata_ha": 10.5,
      "suprafata_mp": null,
      "nr_cadastral": "12345",
      "tarla": "T10",
      "parcela": "P20",
      "nr_carte_funciara": "CF12345",
      "categorie_folosinta": "arabil"
    }
  ],
  "valoare_totala": 50000,
  "valoare_anuala": 10000,
  "moneda": "RON",
  "modalitate_plata": "transfer bancar",
  "clauze_speciale": null,
  "autentificat": false,
  "notar": null
}

TEXT DOCUMENT:
${pdfText.slice(0, 120000)}`;

  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 1;

    try {
      const response = await withAILimit(() => anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 10000,
        system: isRetry
          ? systemPrompt + "\n\nATENȚIE: Răspunsul tău anterior NU a fost JSON valid. Returnează EXCLUSIV JSON."
          : systemPrompt,
        messages: [{
          role: "user",
          content: userPrompt,
        }],
      }));

      let fullText = response.content?.[0]?.type === "text" ? response.content[0].text : "";

      // Handle truncation
      if (response.stop_reason === "max_tokens") {
        console.warn(`[contractExtractor] Attempt ${attempt}: truncated at ${fullText.length} chars, requesting continuation...`);
        const contResponse = await withAILimit(() => anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 10000,
          system: systemPrompt + "\n\nContinuă JSON-ul trunchiat. NU repeta ce a fost generat anterior.",
          messages: [
            { role: "user", content: userPrompt },
            { role: "assistant", content: fullText },
            { role: "user", content: "JSON-ul a fost trunchiat. Continuă EXACT de unde ai rămas:" },
          ],
        }));
        const contText = contResponse.content?.[0]?.type === "text" ? contResponse.content[0].text : "";
        fullText += contText;
        console.log(`[contractExtractor] Continuation: +${contText.length} chars (total: ${fullText.length})`);
      }

      const parsed = safeJSONParse(fullText, "contractExtractor");

      if (parsed) {
        const result = buildContractResult(parsed.data, pdfText, Date.now() - start);
        checkExtractionQuality("contractExtractor", pdfText.length, result.extracted_fields.length);
        return result;
      }

      lastError = `JSON parse failed. Response: "${fullText.slice(0, 300)}"`;
    } catch (err: any) {
      lastError = err.message;
    }

    console.error(`[contractExtractor] Attempt ${attempt}/${MAX_ATTEMPTS}: ${lastError}`);
  }

  console.error(`[contractExtractor] All attempts failed: ${lastError}`);
  return {
    document_type: "contract",
    extracted_fields: [],
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: Date.now() - start,
  };
}

function buildContractResult(data: any, pdfText: string, timeMs: number): ExtractionResult {
  const fields: ExtractionResult["extracted_fields"] = [];
  const m = "ai_sonnet";

  fields.push({ field_key: "tip_contract", field_value: data.tip_contract ?? "altul", confidence: 0.85, source_page: 1, extraction_method: m });
  if (data.nr_contract) fields.push({ field_key: "nr_contract", field_value: data.nr_contract, confidence: 0.9, source_page: 1, extraction_method: m });
  if (data.data_contract) fields.push({ field_key: "data_contract", field_value: data.data_contract, confidence: 0.9, source_page: 1, extraction_method: m });
  if (data.data_start) fields.push({ field_key: "data_start_contract", field_value: data.data_start, confidence: 0.85, source_page: null, extraction_method: m });
  if (data.data_sfarsit) fields.push({ field_key: "data_sfarsit_contract", field_value: data.data_sfarsit, confidence: 0.85, source_page: null, extraction_method: m });
  if (data.durata) fields.push({ field_key: "durata_contract", field_value: data.durata, confidence: 0.85, source_page: null, extraction_method: m });
  if (data.obiect) fields.push({ field_key: "obiect_contract", field_value: data.obiect, confidence: 0.85, source_page: null, extraction_method: m });
  if (data.valoare_totala != null) fields.push({ field_key: "valoare_contract", field_value: data.valoare_totala, confidence: 0.85, source_page: null, extraction_method: m });
  if (data.valoare_anuala != null) fields.push({ field_key: "valoare_anuala_contract", field_value: data.valoare_anuala, confidence: 0.85, source_page: null, extraction_method: m });
  if (data.moneda) fields.push({ field_key: "moneda_contract", field_value: data.moneda, confidence: 0.85, source_page: null, extraction_method: m });
  if (data.modalitate_plata) fields.push({ field_key: "modalitate_plata_contract", field_value: data.modalitate_plata, confidence: 0.8, source_page: null, extraction_method: m });
  if (data.clauze_speciale) fields.push({ field_key: "clauze_speciale_contract", field_value: data.clauze_speciale, confidence: 0.75, source_page: null, extraction_method: m });
  if (data.autentificat != null) fields.push({ field_key: "contract_autentificat", field_value: data.autentificat, confidence: 0.85, source_page: null, extraction_method: m });
  if (data.notar) fields.push({ field_key: "notar_contract", field_value: data.notar, confidence: 0.8, source_page: null, extraction_method: m });

  // Parties
  const parti = data.parti || [];
  parti.forEach((p: any, i: number) => {
    const prefix = `parte_contract_${i}`;
    if (p.nume) fields.push({ field_key: `${prefix}_nume`, field_value: p.nume, confidence: 0.9, source_page: null, extraction_method: m });
    if (p.rol) fields.push({ field_key: `${prefix}_rol`, field_value: p.rol, confidence: 0.85, source_page: null, extraction_method: m });
    if (p.tip) fields.push({ field_key: `${prefix}_tip`, field_value: p.tip, confidence: 0.85, source_page: null, extraction_method: m });
    if (p.cui_cnp) fields.push({ field_key: `${prefix}_cui_cnp`, field_value: p.cui_cnp, confidence: 0.85, source_page: null, extraction_method: m });
    if (p.adresa) fields.push({ field_key: `${prefix}_adresa`, field_value: p.adresa, confidence: 0.8, source_page: null, extraction_method: m });
  });

  // Backwards compat: extract arendas/arendator names for old-style fields
  const arendas = parti.find((p: any) => /arenda[sș]|arendatar/i.test(p.rol || ""));
  if (arendas) {
    fields.push({ field_key: "arendas_nume", field_value: arendas.nume, confidence: 0.85, source_page: null, extraction_method: m });
    if (arendas.cui_cnp) fields.push({ field_key: "arendas_cui", field_value: arendas.cui_cnp, confidence: 0.85, source_page: null, extraction_method: m });
  }

  // Bunuri / parcele
  const bunuri = data.bunuri || [];
  let suprafataTotalaHa = 0;
  bunuri.forEach((b: any, i: number) => {
    const prefix = `bun_contract_${i}`;
    if (b.descriere) fields.push({ field_key: `${prefix}_descriere`, field_value: b.descriere, confidence: 0.85, source_page: null, extraction_method: m });
    if (b.locatie) fields.push({ field_key: `${prefix}_locatie`, field_value: b.locatie, confidence: 0.85, source_page: null, extraction_method: m });
    if (b.suprafata_ha != null) {
      fields.push({ field_key: `${prefix}_suprafata_ha`, field_value: b.suprafata_ha, confidence: 0.85, source_page: null, extraction_method: m });
      suprafataTotalaHa += parseFloat(b.suprafata_ha) || 0;
    }
    if (b.suprafata_mp != null) fields.push({ field_key: `${prefix}_suprafata_mp`, field_value: b.suprafata_mp, confidence: 0.85, source_page: null, extraction_method: m });
    if (b.nr_cadastral) fields.push({ field_key: `${prefix}_nr_cadastral`, field_value: b.nr_cadastral, confidence: 0.85, source_page: null, extraction_method: m });
    if (b.nr_carte_funciara) fields.push({ field_key: `${prefix}_nr_CF`, field_value: b.nr_carte_funciara, confidence: 0.85, source_page: null, extraction_method: m });
    if (b.categorie_folosinta) fields.push({ field_key: `${prefix}_categorie_folosinta`, field_value: b.categorie_folosinta, confidence: 0.8, source_page: null, extraction_method: m });

    // Backwards compat: UAT field
    if (b.locatie) fields.push({ field_key: `parcela_${i}_UAT`, field_value: b.locatie, confidence: 0.85, source_page: null, extraction_method: m });
    if (b.suprafata_ha != null) fields.push({ field_key: `parcela_${i}_suprafata_ha`, field_value: b.suprafata_ha, confidence: 0.85, source_page: null, extraction_method: m });
  });

  // Aggregates
  if (suprafataTotalaHa > 0) {
    fields.push({ field_key: "suprafata_contracte", field_value: suprafataTotalaHa, confidence: 0.85, source_page: null, extraction_method: m });
  }
  fields.push({ field_key: "numar_parcele", field_value: bunuri.length, confidence: 0.95, source_page: null, extraction_method: m });

  // Raw data
  fields.push({ field_key: "_raw_contract", field_value: data, confidence: 0.85, source_page: null, extraction_method: m });

  const docType = data.tip_contract === "arenda" ? "contract_arenda" : `contract_${data.tip_contract || "altul"}`;

  return {
    document_type: docType,
    extracted_fields: fields,
    raw_text: pdfText.slice(0, 5000),
    processing_time_ms: timeMs,
  };
}
