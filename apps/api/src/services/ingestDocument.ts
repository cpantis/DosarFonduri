/**
 * RAG v2 — Unified document ingestion pipeline.
 *
 * Single entry point: classify → route → process.
 * 5 routing paths:
 *   vectorize          → chunk + embed → chunks table
 *   template_fill      → mark for Neemia fill (no vectorization)
 *   template_compose   → extract section structure for Neemia compose
 *   extract_data       → OCR + extract structured fields
 *   vectorize_and_extract → chunk + embed + extract fields
 *
 * Coexists with existing processGuide, processTemplate, processClientDoc.
 */
import { db } from "../db";
import { documents, chunks } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { getFileBuffer } from "./storage";
import {
  extractTextFromPDF,
  extractTextFromDOCX,
  extractTextFromXLSX,
  extractTextFromImage,
  extractTextFromDOC,
} from "./ocr";
import { classifyDocumentForIngestion, type ClassificationResult } from "./documentClassifier";
import { chunkDocument } from "./ragChunker";
import { enrichChunksMetadata } from "./metadataEnricher";
import { extractStructuredData, type ExtractedField } from "./dataExtractor";
// Voyage embeddings removed — BM25 text search is sufficient
// import { embedDocumentChunks } from "./voyageEmbeddings";
import { publishJobProgress } from "../lib/sse";

export interface IngestOptions {
  documentId: string;
  cabinetId: string;
  sessionId: string;
  organizationId: string;
  /** If set, skip classification and use this routing directly (for reclassification) */
  forceClassification?: ClassificationResult;
}

export interface IngestResult {
  documentId: string;
  classification: ClassificationResult;
  chunksCount?: number;
  extractedFields?: number;
  timeMs: number;
}

/**
 * Main ingestion pipeline — called by the BullMQ job.
 */
export async function ingestDocument(options: IngestOptions): Promise<IngestResult> {
  const { documentId, cabinetId, sessionId, organizationId, forceClassification } = options;
  const startTime = Date.now();

  const progress = (message: string, percent: number) => {
    publishJobProgress(organizationId, {
      jobId: `ingest-${documentId}`,
      jobType: "ingest-document",
      documentId,
      progress: percent,
      status: "processing",
      message,
    }).catch(() => {});
  };

  try {
    // ═══════════════════════════════════════════
    // STEP 1: Get document record + file buffer
    // ═══════════════════════════════════════════
    progress("Pregătire document...", 5);

    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    });
    if (!doc) throw new Error(`Document not found: ${documentId}`);

    await db
      .update(documents)
      .set({ status: "processing" })
      .where(eq(documents.id, documentId));

    const { buffer, name: fileName } = await getFileBuffer(doc.fileId);

    // ═══════════════════════════════════════════
    // STEP 2: Extract text (OCR) — reuse existing
    // ═══════════════════════════════════════════
    progress("Extragere text...", 10);

    const fullText = await extractText(buffer, fileName, doc.fileType);
    const firstPagesText = fullText.slice(0, 6000);

    // ═══════════════════════════════════════════
    // STEP 3: Classify document (Sonnet)
    // ═══════════════════════════════════════════
    progress("Clasificare document...", 15);

    // Use forced classification, or pre-existing manual classification (from reclassify),
    // or run AI classification
    let classification: ClassificationResult;
    if (forceClassification) {
      classification = forceClassification;
    } else if (doc.classification && (doc.classification as any).confidence === 1.0 && !(doc.classification as any).isProcessed) {
      // Manual reclassification — use what's already on the document
      classification = doc.classification as any as ClassificationResult;
    } else {
      classification = await classifyDocumentForIngestion(fileName, firstPagesText);
    }

    // Save classification on document
    await db
      .update(documents)
      .set({ classification: classification as any })
      .where(eq(documents.id, documentId));

    // ═══════════════════════════════════════════
    // STEP 4: Route to appropriate processor
    // ═══════════════════════════════════════════

    let chunksCount: number | undefined;
    let extractedFieldsCount: number | undefined;

    switch (classification.routingAction) {
      case "vectorize": {
        const result = await routeVectorize(documentId, cabinetId, sessionId, fullText, classification, progress);
        chunksCount = result.chunksCount;
        break;
      }

      case "template_fill": {
        await routeTemplateFill(documentId, organizationId, buffer, fileName, classification, progress);
        break;
      }

      case "template_compose": {
        await routeTemplateCompose(documentId, organizationId, classification, progress);
        break;
      }

      case "extract_data": {
        const result = await routeExtractData(documentId, fullText, fileName, classification, progress);
        extractedFieldsCount = result.fieldsCount;
        break;
      }

      case "vectorize_and_extract": {
        const [vecResult, extResult] = await Promise.all([
          routeVectorize(documentId, cabinetId, sessionId, fullText, classification, progress),
          routeExtractData(documentId, fullText, fileName, classification, (msg, pct) => progress(msg, Math.min(pct, 85))),
        ]);
        chunksCount = vecResult.chunksCount;
        extractedFieldsCount = extResult.fieldsCount;
        break;
      }

      default:
        console.warn(`[ingestDocument] Unknown routing action: ${classification.routingAction}, defaulting to vectorize`);
        const result = await routeVectorize(documentId, cabinetId, sessionId, fullText, classification, progress);
        chunksCount = result.chunksCount;
    }

    // ═══════════════════════════════════════════
    // STEP 5: Mark as completed
    // ═══════════════════════════════════════════
    const elapsed = Date.now() - startTime;

    const updatedClassification = {
      ...classification,
      isProcessed: true,
      processedAt: new Date().toISOString(),
      chunksCount,
      extractedFields: extractedFieldsCount,
    };

    await db
      .update(documents)
      .set({
        status: "processed",
        classification: updatedClassification as any,
        processedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    publishJobProgress(organizationId, {
      jobId: `ingest-${documentId}`,
      jobType: "ingest-document",
      documentId,
      progress: 100,
      status: "completed",
      message: `Document procesat: ${classification.description}`,
    }).catch(() => {});

    return {
      documentId,
      classification: updatedClassification,
      chunksCount,
      extractedFields: extractedFieldsCount,
      timeMs: elapsed,
    };
  } catch (error: any) {
    console.error(`[ingestDocument] Failed for ${documentId}:`, error.message);

    await db
      .update(documents)
      .set({
        status: "error",
        processingError: error.message?.slice(0, 1000),
      })
      .where(eq(documents.id, documentId));

    publishJobProgress(organizationId, {
      jobId: `ingest-${documentId}`,
      jobType: "ingest-document",
      documentId,
      progress: 0,
      status: "failed",
      message: `Eroare procesare: ${error.message?.slice(0, 200)}`,
    }).catch(() => {});

    throw error;
  }
}

// ═══════════════════════════════════════════════════════
// ROUTING HANDLERS
// ═══════════════════════════════════════════════════════

type ProgressFn = (message: string, percent: number) => void;

/**
 * VECTORIZE route: chunk → enrich metadata → embed → store in chunks table.
 * Used for: ghid, fisa_evaluare, anexa
 */
async function routeVectorize(
  documentId: string,
  cabinetId: string,
  sessionId: string,
  fullText: string,
  classification: ClassificationResult,
  progress: ProgressFn,
): Promise<{ chunksCount: number }> {
  progress("Segmentare text...", 25);
  const docChunks = chunkDocument(fullText);

  if (docChunks.length === 0) {
    return { chunksCount: 0 };
  }

  progress("Analiză conținut...", 40);
  let metadata: any[] = [];
  try {
    metadata = await enrichChunksMetadata(docChunks, classification.docType, classification.description);
  } catch (err) {
    // Non-critical: metadata enrichment uses Sonnet — may fail on rate limits
    console.warn(`[ingest] Metadata enrichment failed, using defaults:`, (err as Error).message);
    metadata = docChunks.map(() => ({ layer: "narativ", topic: classification.description, doc_type: classification.docType, importance: "normal" }));
  }

  progress("Salvare chunks...", 70);

  // Delete old chunks for this document (re-upload scenario)
  await db.delete(chunks).where(eq(chunks.documentId, documentId));

  // Save chunks WITHOUT embeddings — BM25 text search works via tsvector GENERATED column
  // Embeddings are optional (Voyage AI) — Solomon searches with keyword matching
  const records = docChunks.map((chunk, i) => ({
    cabinetId,
    sessionId,
    documentId,
    sourceType: "session" as const,
    content: chunk.content,
    // embedding: null — saved without vector, BM25 search still works
    metadata: {
      ...(metadata[i] || {}),
      page: chunk.pageStart,
    },
  }));

  // Insert in batches of 100 to avoid query size limits
  for (let i = 0; i < records.length; i += 100) {
    const batch = records.slice(i, i + 100);
    await db.insert(chunks).values(batch);
  }

  return { chunksCount: docChunks.length };
}

/**
 * TEMPLATE_FILL route: mark document for Neemia fill.
 * Does NOT modify the original document.
 */
async function routeTemplateFill(
  documentId: string,
  organizationId: string,
  buffer: Buffer,
  fileName: string,
  classification: ClassificationResult,
  progress: ProgressFn,
): Promise<void> {
  progress("Pregătire template fill...", 30);

  // Set generationMode + processingType on document so processTemplate recognizes it
  await db.update(documents).set({
    generationMode: "fill" as any,
    processingType: "template" as any,
  }).where(eq(documents.id, documentId));

  // CRITICAL: Dispatch processTemplate job to create templateElements + composeConfig + placeholder_mapping
  // This is what Neemia needs to generate documents. Without it, templates are invisible.
  try {
    const { processTemplateQueue, JOB_PRIORITY } = await import("../lib/queue");
    const { isRedisReady } = await import("../lib/redis");
    if (isRedisReady()) {
      await processTemplateQueue.add("process-template", {
        documentId,
        organizationId,
      }, {
        priority: JOB_PRIORITY.TEMPLATE,
        jobId: `tpl-ingest-${documentId}`,
      });
      progress("Template trimis la procesare (extragere câmpuri + mapare)...", 60);
    }
  } catch (err) {
    console.warn(`[ingest] processTemplate dispatch failed for ${documentId}:`, (err as Error).message);
  }

  // FORM-1: Also extract FormSpec (parallel, non-blocking)
  try {
    progress("Extragere structură formular...", 70);
    const { extractAndSaveFormSpec } = await import("./formSpecExtractor");
    const { formSpecId, spec } = await extractAndSaveFormSpec(
      buffer, fileName, documentId, organizationId,
    );
    progress(`FormSpec extras: ${spec.sourceFormat}, ${spec.totalFields} câmpuri`, 85);
  } catch (err) {
    console.warn(`[ingest] FormSpec extraction failed for ${documentId}:`, (err as Error).message);
  }

  progress("Template pregătit pentru completare.", 90);
}

/**
 * TEMPLATE_COMPOSE route: extract section structure for Neemia compose.
 */
async function routeTemplateCompose(
  documentId: string,
  organizationId: string,
  classification: ClassificationResult,
  progress: ProgressFn,
): Promise<void> {
  progress("Analiză structură template compose...", 30);

  // Set generationMode on document
  // Set generationMode + processingType on document so processTemplate recognizes it
  await db.update(documents).set({
    generationMode: "compose" as any,
    processingType: "template" as any,
  }).where(eq(documents.id, documentId));

  // CRITICAL: Dispatch processTemplate job to extract COMPOSE: markers, create composeConfig + templateElements
  // Without this, Neemia compose has no sections to generate.
  try {
    const { processTemplateQueue, JOB_PRIORITY } = await import("../lib/queue");
    const { isRedisReady } = await import("../lib/redis");
    if (isRedisReady()) {
      await processTemplateQueue.add("process-template", {
        documentId,
        organizationId,
      }, {
        priority: JOB_PRIORITY.TEMPLATE,
        jobId: `tpl-compose-${documentId}`,
      });
      progress("Template compose trimis la procesare (detectare secțiuni + mapare)...", 70);
    }
  } catch (err) {
    console.warn(`[ingest] processTemplate dispatch failed for compose ${documentId}:`, (err as Error).message);
  }

  progress("Template compose pregătit.", 90);
}

/**
 * EXTRACT_DATA route: extract structured fields.
 * Used for: document_client (CI), certificat, oferta
 */
async function routeExtractData(
  documentId: string,
  fullText: string,
  fileName: string,
  classification: ClassificationResult,
  progress: ProgressFn,
): Promise<{ fieldsCount: number }> {
  progress("Extragere date structurate...", 40);

  const result = await extractStructuredData(fullText, classification.docType, fileName);

  progress("Date extrase: " + result.fields.length + " câmpuri", 80);

  // Store extraction result on the document's processingResult field
  await db
    .update(documents)
    .set({
      processingResult: {
        document_type: classification.docType,
        extracted_fields: result.fields.map(f => ({
          field_key: f.elementName,
          field_value: f.value,
          confidence: f.confidence,
          source_page: null,
          extraction_method: "rag_v2_sonnet",
        })),
        raw_text: fullText.slice(0, 5000),
        processing_time_ms: 0, // will be set by caller
      },
    })
    .where(eq(documents.id, documentId));

  return { fieldsCount: result.fields.length };
}

// ═══════════════════════════════════════════════════════
// TEXT EXTRACTION HELPER
// ═══════════════════════════════════════════════════════

/**
 * Extract text from a file buffer based on file type.
 * Reuses all existing OCR functions.
 */
async function extractText(
  buffer: Buffer,
  fileName: string,
  fileType: string,
): Promise<string> {
  switch (fileType) {
    case "pdf": {
      const result = await extractTextFromPDF(buffer);
      return result.text;
    }
    case "docx": {
      return await extractTextFromDOCX(buffer, fileName);
    }
    case "xlsx": {
      return await extractTextFromXLSX(buffer, fileName);
    }
    case "doc": {
      return await extractTextFromDOC(buffer, fileName);
    }
    case "png":
    case "jpg": {
      return await extractTextFromImage(buffer, fileName);
    }
    default:
      throw new Error(`Unsupported file type for text extraction: ${fileType}`);
  }
}
