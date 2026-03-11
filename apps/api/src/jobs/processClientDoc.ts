import { Worker, Job } from "bullmq";
import { db } from "../db";
import { documents } from "../db/schema";
import { eq } from "drizzle-orm";
import { getFileBuffer } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX, classifyDocument } from "../services/ocr";
import { logAIUsage } from "../services/aiUsage";
import { publishEvent } from "../lib/sse";

interface ProcessClientDocPayload {
  documentId: string;
  organizationId: string;
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

      await job.updateProgress(30);

      // Step 2: Classify document type using Haiku
      const classification = await classifyDocument(text);

      await job.updateProgress(60);

      // Step 3: Update document with classification results (persist documentType!)
      const pageCount = (text.match(/--- Pagina|--- Sheet/g) || []).length || 1;
      await db.update(documents).set({
        status: "processed",
        pageCount,
        documentTypeClass: classification.documentType as any,
        classificationConfidence: classification.confidence.toFixed(2),
        processedAt: new Date(),
      }).where(eq(documents.id, documentId));

      await job.updateProgress(100);

      // SSE notification
      publishEvent(`org:${organizationId}:uploads`, "document_processed", {
        documentId,
        documentName: doc.name,
        status: "processed",
        processingType: "client_doc",
        documentType: classification.documentType,
        confidence: classification.confidence,
        message: `Document procesat "${doc.name}" — clasificat ca ${classification.documentType}`,
      }).catch(() => {});

      await logAIUsage({
        organizationId,
        agent: "ocr",
        model: "claude-haiku-4-5-20251001",
        tokensInput: 500,
        tokensOutput: 100,
        action: "classify_client_document",
      });

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
