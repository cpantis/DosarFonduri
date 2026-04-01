/**
 * RAG v2 — Document classifier (Sonnet)
 *
 * Classifies uploaded documents by type and routing action.
 * Used by the ingestion pipeline to determine processing path:
 *   vectorize | template_fill | template_compose | extract_data | vectorize_and_extract
 *
 * Does NOT replace the existing classifyDocument in ocr.ts —
 * that one maps to documentTypeClass enum. This one adds routingAction.
 */
import { anthropic, withAILimit } from "../lib/anthropic";

export interface ClassificationResult {
  docType:
    | "ghid"
    | "cerere_finantare"
    | "anexa"
    | "fisa_evaluare"
    | "template_fill"
    | "template_compose"
    | "document_client"
    | "oferta"
    | "certificat"
    | "studiu_fezabilitate"
    | "altul";
  routingAction:
    | "vectorize"
    | "template_fill"
    | "template_compose"
    | "extract_data"
    | "vectorize_and_extract";
  confidence: number;
  description: string;
  detectedProgram?: string;
  /** True when AI classification failed and fallback was used */
  isClassificationFallback?: boolean;
}

const SYSTEM_PROMPT = `Ești un clasificator de documente pentru dosare de fonduri europene românești.

Analizează documentul și clasifică-l PRECIS.

TIPURI DE DOCUMENTE ȘI RUTAREA LOR:

1. VECTORIZE (se indexează pentru căutare semantică):
   - ghid = Ghidul Solicitantului (document lung, capitole, condiții eligibilitate, criterii de selecție)
   - fisa_evaluare = Fișa de evaluare generală/detaliată (grile de evaluare, criterii E1-E9, tabel verificare)
   - anexa = Anexe informative (Lista UAT, Corelare putere mașini, tabele referință, anunțuri)

2. TEMPLATE_FILL (se păstrează original, se completează câmpuri):
   - cerere_finantare = Cererea de Finanțare (formular PDF/XFA sau DOCX cu câmpuri de completat)
   - template_fill = Orice template cu câmpuri {{placeholder}} sau câmpuri formular de completat

3. TEMPLATE_COMPOSE (se păstrează structura, se generează text):
   - template_compose = Memoriu Justificativ, Studiu de Fezabilitate template (document cu secțiuni narrative goale de generat)

4. EXTRACT_DATA (se extrag date structurate):
   - document_client = CI/BI, certificat naștere, diplome
   - certificat = Certificate diverse (ONRC constatator, fiscal, veterinar, mediu)
   - oferta = Oferte furnizori (prețuri, specificații tehnice, cataloguri)

5. VECTORIZE_AND_EXTRACT (ambele):
   - studiu_fezabilitate = SF/DALI completat (date tehnice + narativ lung de vectorizat)

REGULI:
- Dacă documentul e GOL sau are doar titluri/secțiuni fără conținut → e un template (fill sau compose)
- Dacă are câmpuri formular PDF (XFA) sau {{placeholders}} → template_fill
- Dacă are secțiuni narrative goale (tip "descrieți investiția") → template_compose
- Dacă e un document completat cu date reale → extract_data sau vectorize
- Ghidurile sunt lungi (30+ pagini), au capitole, subcapitole, condiții

Răspunde DOAR cu JSON valid, fără alte explicații.`;

/**
 * Classify a document using Sonnet.
 *
 * @param fileName - Original file name (helps with classification hints)
 * @param firstPagesText - OCR text from first 3 pages
 * @param sessionContext - Optional program/measure context
 */
export async function classifyDocumentForIngestion(
  fileName: string,
  firstPagesText: string,
  sessionContext?: { program?: string; masura?: string },
): Promise<ClassificationResult> {
  const userPrompt = `Fișier: "${fileName}"
${sessionContext?.program ? `Context sesiune: program ${sessionContext.program}${sessionContext.masura ? `, măsura ${sessionContext.masura}` : ""}` : ""}

Conținut (primele pagini):
${firstPagesText.slice(0, 4000)}

Clasifică documentul. JSON:
{
  "docType": "...",
  "routingAction": "...",
  "confidence": 0.0-1.0,
  "description": "descriere scurtă a documentului",
  "detectedProgram": "AFIR/PNRR/POR/null"
}`;

  const startTime = Date.now();

  const response = await withAILimit(
    () =>
      anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    "batch",
  );

  const elapsed = Date.now() - startTime;
  const text =
    response.content?.[0]?.type === "text" ? response.content[0].text : "{}";
  const cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      docType: parsed.docType || "altul",
      routingAction: parsed.routingAction || "vectorize",
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      description: parsed.description || fileName,
      detectedProgram: parsed.detectedProgram || undefined,
    };
  } catch {
    console.warn("[documentClassifier] AI classification failed, using fallback:", cleaned.slice(0, 200));
    return {
      docType: "altul",
      routingAction: "vectorize",
      confidence: 0,
      description: `${fileName} (clasificare automată eșuată)`,
      isClassificationFallback: true,
    };
  }
}
