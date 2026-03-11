import { Worker, Job } from "bullmq";
import { db } from "../db";
import { documents } from "../db/schema";
import { eq } from "drizzle-orm";
import { getFileBuffer } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX, classifyDocument } from "../services/ocr";
import { logAIUsage } from "../services/aiUsage";
import { publishEvent } from "../lib/sse";
import type { ExtractionResult } from "../services/extractionTypes";

// Extractors
import { extractCompanyFromDocument } from "../services/companyExtractor";
import { parseBilantPDF } from "../services/bilantParser";
import { extractContract } from "../services/contractExtractor";
import { extractOferta } from "../services/ofertaExtractor";
import { extractRegistruImobilizari } from "../services/registruExtractor";
import { extractDocumentMediu } from "../services/mediuExtractor";
import { extractExtrasCont } from "../services/extrasContExtractor";
import { extractDeclaratie } from "../services/declaratieExtractor";

interface ProcessClientDocPayload {
  documentId: string;
  organizationId: string;
}

/**
 * Adapt companyExtractor output to the standardized ExtractionResult format.
 */
function adaptCompanyResult(data: Awaited<ReturnType<typeof extractCompanyFromDocument>>, rawText: string, timeMs: number): ExtractionResult {
  const fields: ExtractionResult["extracted_fields"] = [];

  if (!data) {
    return { document_type: "certificat_constatator", extracted_fields: [], raw_text: rawText.slice(0, 5000), processing_time_ms: timeMs };
  }

  if (data.denumire) fields.push({ field_key: "denumire_solicitant", field_value: data.denumire, confidence: 0.95, source_page: 1, extraction_method: "ai_sonnet" });
  if (data.cui) fields.push({ field_key: "cui", field_value: data.cui, confidence: 0.95, source_page: 1, extraction_method: "ai_sonnet" });
  if (data.regCom) fields.push({ field_key: "nr_inmatriculare", field_value: data.regCom, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
  if (data.formaJuridica) fields.push({ field_key: "forma_juridica", field_value: data.formaJuridica, confidence: 0.9, source_page: 1, extraction_method: "ai_sonnet" });
  if (data.caenPrincipal) fields.push({ field_key: "caen_principal", field_value: data.caenPrincipal, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.caenSecundare?.length) fields.push({ field_key: "caen_secundare", field_value: data.caenSecundare, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.adresa) fields.push({ field_key: "adresa_sediu", field_value: data.adresa, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.localitate) fields.push({ field_key: "localitate", field_value: data.localitate, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.judet) fields.push({ field_key: "judet", field_value: data.judet, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.stare) fields.push({ field_key: "stare_firma", field_value: data.stare, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.capitalSocial) fields.push({ field_key: "capital_social", field_value: data.capitalSocial, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.anInfiintare) fields.push({ field_key: "data_inregistrare", field_value: data.anInfiintare, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });

  if (data.asociati?.length) fields.push({ field_key: "_raw_asociati", field_value: data.asociati, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.administratori?.length) fields.push({ field_key: "_raw_administratori", field_value: data.administratori, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.financials?.length) fields.push({ field_key: "_raw_financials", field_value: data.financials, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });

  return { document_type: "certificat_constatator", extracted_fields: fields, raw_text: rawText.slice(0, 5000), processing_time_ms: timeMs };
}

/**
 * Adapt bilantParser output to the standardized ExtractionResult format.
 */
function adaptBilantResult(data: Awaited<ReturnType<typeof parseBilantPDF>>, rawText: string, timeMs: number): ExtractionResult {
  const fields: ExtractionResult["extracted_fields"] = [];
  const year = data.year;

  if (data.f20?.cifraAfaceriNeta != null) fields.push({ field_key: `cifra_afaceri_${year}`, field_value: data.f20.cifraAfaceriNeta, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f20?.profitNet != null) fields.push({ field_key: `profit_net_${year}`, field_value: data.f20.profitNet, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f20?.profitExploatare != null) fields.push({ field_key: `profit_exploatare_${year}`, field_value: data.f20.profitExploatare, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f10?.activeImobilizate?.total != null) fields.push({ field_key: `active_totale_${year}`, field_value: (data.f10.activeImobilizate.total || 0) + (data.f10.activeCirculante?.total || 0), confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f10?.capitaluriProprii != null) fields.push({ field_key: `capitaluri_proprii_${year}`, field_value: data.f10.capitaluriProprii, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });
  if (data.f30?.numarMediuSalariati != null) fields.push({ field_key: `numar_angajati_${year}`, field_value: data.f30.numarMediuSalariati, confidence: 0.9, source_page: null, extraction_method: "ai_sonnet" });

  // Compute datorii_totale if we have the data
  if (data.f10?.datoriiSubAnul != null || data.f10?.datoriiPesteAnul != null) {
    const datorii = (data.f10.datoriiSubAnul || 0) + (data.f10.datoriiPesteAnul || 0);
    fields.push({ field_key: `datorii_totale_${year}`, field_value: datorii, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });
  }

  fields.push({ field_key: `an_fiscal`, field_value: year, confidence: 0.95, source_page: 1, extraction_method: "ai_sonnet" });
  fields.push({ field_key: `_raw_bilant_${year}`, field_value: data, confidence: 0.85, source_page: null, extraction_method: "ai_sonnet" });

  return { document_type: "bilant_anaf", extracted_fields: fields, raw_text: rawText.slice(0, 5000), processing_time_ms: timeMs };
}

/**
 * Detect the fiscal year from bilanț text. Falls back to current year - 1.
 */
function detectBilantYear(text: string): number {
  const yearPatterns = [
    /anul\s+fiscal?\s+(\d{4})/i,
    /pentru\s+anul\s+(\d{4})/i,
    /ANUL\s+(\d{4})/,
    /31[./]12[./](\d{4})/,
    /exerci[țt]iul\s+financiar\s+(\d{4})/i,
  ];

  for (const pattern of yearPatterns) {
    const match = text.match(pattern);
    if (match) {
      const year = parseInt(match[1]);
      if (year >= 2015 && year <= new Date().getFullYear()) return year;
    }
  }

  return new Date().getFullYear() - 1;
}

/**
 * Run the appropriate extractor based on document type.
 * Returns null for document types that don't have extractors.
 */
async function runExtractor(documentType: string, text: string): Promise<ExtractionResult | null> {
  const start = Date.now();

  switch (documentType) {
    case "certificat_constatator": {
      const data = await extractCompanyFromDocument(text);
      return adaptCompanyResult(data, text, Date.now() - start);
    }
    case "bilant_anaf": {
      const year = detectBilantYear(text);
      const data = await parseBilantPDF(text, year);
      return adaptBilantResult(data, text, Date.now() - start);
    }
    case "contract_arenda":
      return extractContract(text);
    case "oferta_pret":
      return extractOferta(text);
    case "registru_imobilizari":
      return extractRegistruImobilizari(text);
    case "document_mediu":
      return extractDocumentMediu(text);
    case "extras_cont":
      return extractExtrasCont(text);
    case "declaratie_expert_contabil":
      return extractDeclaratie(text);
    default:
      return null;
  }
}

/**
 * Determine the AI model used by the extractor for cost logging.
 */
function getExtractorModel(documentType: string): string {
  switch (documentType) {
    case "document_mediu":
    case "extras_cont":
      return "claude-haiku-4-5-20251001";
    default:
      return "claude-sonnet-4-20250514";
  }
}

export const processClientDocWorker = new Worker<ProcessClientDocPayload>(
  "process-client-doc",
  async (job: Job<ProcessClientDocPayload>) => {
    const { documentId, organizationId } = job.data;

    try {
      await db.update(documents).set({ status: "processing" }).where(eq(documents.id, documentId));

      const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
      if (!doc) throw new Error("Document not found");

      const { buffer, name: fileName } = await getFileBuffer(doc.fileId);

      // Step 1: Extract text
      let text = "";
      if (doc.fileType === "pdf") {
        text = await extractTextFromPDF(buffer);
      } else if (doc.fileType === "docx" || doc.fileType === "doc") {
        text = await extractTextFromDOCX(buffer, fileName);
      } else if (doc.fileType === "xlsx") {
        text = await extractTextFromXLSX(buffer, fileName);
      } else {
        throw new Error(`Format nesuportat: ${doc.fileType}`);
      }

      await job.updateProgress(20);

      // Step 2: Classify document type using Haiku
      const classification = await classifyDocument(text);

      await job.updateProgress(40);

      await logAIUsage({
        organizationId,
        agent: "ocr",
        model: "claude-haiku-4-5-20251001",
        tokensInput: 500,
        tokensOutput: 100,
        action: "classify_client_document",
      });

      // Step 3: Extract structured data based on document type
      let extractionResult: ExtractionResult | null = null;
      try {
        extractionResult = await runExtractor(classification.documentType, text);
        await job.updateProgress(80);

        if (extractionResult) {
          const extractModel = getExtractorModel(classification.documentType);
          await logAIUsage({
            organizationId,
            agent: "ocr",
            model: extractModel,
            tokensInput: Math.min(Math.round(text.length / 4), 20000),
            tokensOutput: 2000,
            action: `extract_${classification.documentType}`,
          });
        }
      } catch (extractError) {
        // Extraction failure is non-fatal — document is still classified
        console.error(`Extraction failed for ${classification.documentType}:`, extractError);
      }

      // Step 4: Save classification + extraction results to DB
      const pageCount = (text.match(/--- Pagina|--- Sheet/g) || []).length || 1;
      await db.update(documents).set({
        status: "processed",
        pageCount,
        documentTypeClass: classification.documentType as any,
        classificationConfidence: classification.confidence.toFixed(2),
        processingResult: extractionResult ?? undefined,
        processedAt: new Date(),
      }).where(eq(documents.id, documentId));

      await job.updateProgress(95);

      // Step 5: SSE notifications
      publishEvent(`org:${organizationId}:uploads`, "document_processed", {
        documentId,
        documentName: doc.name,
        status: "processed",
        processingType: "client_doc",
        documentType: classification.documentType,
        confidence: classification.confidence,
        message: `Document procesat "${doc.name}" — clasificat ca ${classification.documentType}`,
      }).catch(() => {});

      if (extractionResult && extractionResult.extracted_fields.length > 0) {
        publishEvent(`org:${organizationId}:uploads`, "extraction_complete", {
          documentId,
          documentName: doc.name,
          documentType: classification.documentType,
          fields_count: extractionResult.extracted_fields.length,
          processing_time_ms: extractionResult.processing_time_ms,
          message: `Extrase ${extractionResult.extracted_fields.length} câmpuri din "${doc.name}"`,
        }).catch(() => {});
      }

      await job.updateProgress(100);

    } catch (error) {
      console.error(`Process client doc error (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 3}):`, error);

      const isLastAttempt = (job.attemptsMade + 1) >= (job.opts.attempts || 3);
      const docStatus = isLastAttempt ? "failed" : "error";
      await db.update(documents).set({ status: docStatus as any }).where(eq(documents.id, documentId));

      publishEvent(`org:${organizationId}:uploads`, "document_failed", {
        documentId,
        status: docStatus,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts || 3,
        willRetry: !isLastAttempt,
        message: isLastAttempt
          ? `Eroare la procesarea documentului (toate ${job.opts.attempts || 3} încercări eșuate)`
          : `Eroare la procesarea documentului (încercare ${job.attemptsMade + 1}/${job.opts.attempts || 3}, se reîncearcă)`,
      }).catch(() => {});
      throw error;
    }
  },
  { connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || "6379") } }
);
