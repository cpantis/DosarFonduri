/**
 * RAG v2 — Structured data extraction for the ingestion pipeline.
 *
 * Thin orchestrator that delegates to existing specialized extractors
 * (carteIdentitateExtractor, bilantParser, ofertaExtractor, etc.)
 * based on the classification docType.
 *
 * Does NOT duplicate extraction logic — reuses processClientDoc's extractors.
 */
import { anthropic, withAILimit } from "../lib/anthropic";

export interface ExtractedField {
  elementName: string;
  value: string;
  confidence: number;
  source: string;
}

export interface ExtractionResult {
  fields: ExtractedField[];
  documentSummary: string;
}

// Maps RAG v2 docType to extraction prompt specialization
const DOC_TYPE_PROMPTS: Record<string, string> = {
  document_client: `Extrage din acest document de identitate (CI/BI/pașaport):
- cnp (cod numeric personal)
- nume, prenume
- serie_ci, numar_ci
- adresa_domiciliu (stradă, nr, localitate, județ)
- data_nastere
- cetatenie
- data_expirare_ci`,

  certificat: `Extrage din acest certificat:
- tip_certificat (constatator/fiscal/veterinar/mediu/etc.)
- numar_certificat
- data_emitere
- emitent
- valabilitate
- denumire_solicitant (dacă apare)
- cui (dacă apare)
- nr_registru_comert (dacă apare)`,

  oferta: `Extrage din această ofertă de preț:
- furnizor_nume
- furnizor_cui (dacă apare)
- produse (lista: denumire, specificații, preț unitar, cantitate)
- valoare_totala
- moneda
- termen_valabilitate
- termen_livrare`,

  studiu_fezabilitate: `Extrage datele tehnice cheie din acest studiu de fezabilitate:
- tip_investitie
- valoare_totala_investitie
- valoare_eligibila
- durata_implementare (luni)
- localizare (localitate, județ)
- indicatori_tehnici (lista: indicator, valoare, unitate de măsură)
- capacitati (existente vs. propuse)`,
};

/**
 * Extract structured data from a document using Sonnet.
 *
 * For the ingestion pipeline — lighter than processClientDoc's full extraction
 * which also handles element upsert, validation, eligibility, and scoring.
 *
 * @param text - Full OCR text of the document
 * @param docType - Classification docType
 * @param fileName - Original file name for context
 */
export async function extractStructuredData(
  text: string,
  docType: string,
  fileName: string,
): Promise<ExtractionResult> {
  const typePrompt = DOC_TYPE_PROMPTS[docType] || `Extrage toate câmpurile structurate relevante din document.`;

  const response = await withAILimit(
    () =>
      anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: `Ești expert în extragerea datelor structurate din documente românești pentru dosare de fonduri europene.
Extrage EXACT câmpurile cerute. Pentru fiecare câmp, estimează o încredere (confidence) 0-1.
Răspunde DOAR cu JSON valid.`,
        messages: [
          {
            role: "user",
            content: `Fișier: "${fileName}"

${typePrompt}

Conținut document:
${text.slice(0, 8000)}

Returnează JSON:
{
  "fields": [
    { "elementName": "...", "value": "...", "confidence": 0.0-1.0, "source": "pagina X" }
  ],
  "documentSummary": "descriere scurtă a documentului"
}`,
          },
        ],
      }),
    "batch",
  );

  const responseText =
    response.content?.[0]?.type === "text" ? response.content[0].text : "{}";
  const cleaned = responseText
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      fields: (parsed.fields || []).map((f: any) => ({
        elementName: f.elementName || f.element_name || "",
        value: String(f.value ?? ""),
        confidence: Math.min(1, Math.max(0, f.confidence || 0.5)),
        source: f.source || fileName,
      })),
      documentSummary: parsed.documentSummary || parsed.document_summary || fileName,
    };
  } catch {
    console.warn("[dataExtractor] Failed to parse Sonnet response:", cleaned.slice(0, 200));
    return { fields: [], documentSummary: fileName };
  }
}
