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
import { embedDocumentChunks } from "./voyageEmbeddings";
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
        await routeTemplateFill(documentId, classification, progress);
        break;
      }

      case "template_compose": {
        await routeTemplateCompose(documentId, classification, progress);
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
  const metadata = await enrichChunksMetadata(docChunks, classification.docType, classification.description);

  progress("Generare embeddings Voyage...", 60);
  const embeddings = await embedDocumentChunks(docChunks.map(c => c.content));

  progress("Salvare vectori...", 85);

  // Delete old chunks for this document (re-upload scenario)
  await db.delete(chunks).where(eq(chunks.documentId, documentId));

  // Batch insert chunks
  const records = docChunks.map((chunk, i) => ({
    cabinetId,
    sessionId,
    documentId,
    sourceType: "session" as const,
    content: chunk.content,
    embedding: embeddings[i],
    metadata: {
      ...metadata[i],
      page: chunk.pageStart,
      section: undefined, // section comes from metadata enrichment
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
  classification: ClassificationResult,
  progress: ProgressFn,
): Promise<void> {
  progress("Pregătire template fill...", 50);

  // The document remains as-is in R2.
  // Neemia fill will receive the original file for XFA/DOCX field filling.
  // We just update the classification metadata.
  progress("Template marcat pentru completare.", 90);
}

/**
 * TEMPLATE_COMPOSE route: extract section structure for Neemia compose.
 */
async function routeTemplateCompose(
  documentId: string,
  classification: ClassificationResult,
  progress: ProgressFn,
): Promise<void> {
  progress("Analiză structură template...", 50);

  // The document structure (sections) will be analyzed when Neemia compose
  // is actually triggered. The blueprint/composeConfig fields on documents
  // already handle this. We just mark the classification.
  progress("Template marcat pentru generare.", 90);
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
