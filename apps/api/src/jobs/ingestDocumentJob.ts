/**
 * RAG v2 — BullMQ worker for document ingestion pipeline.
 *
 * Handles the `ingest-document` queue.
 * Coexists with existing processGuide, processTemplate, processClientDoc workers.
 */
import { Worker, Job } from "bullmq";
import { redis } from "../lib/redis";
import { ingestDocument } from "../services/ingestDocument";

export interface IngestDocumentJobData {
  documentId: string;
  cabinetId: string;
  sessionId: string;
  organizationId: string;
}

async function handler(job: Job<IngestDocumentJobData>) {
  const { documentId, cabinetId, sessionId, organizationId } = job.data;

  console.log(`[ingest-document] Processing document ${documentId} (session: ${sessionId})`);

  const result = await ingestDocument({
    documentId,
    cabinetId,
    sessionId,
    organizationId,
  });

  console.log(
    `[ingest-document] Done: ${documentId} → ${result.classification.docType}/${result.classification.routingAction}` +
    (result.chunksCount ? ` (${result.chunksCount} chunks)` : "") +
    (result.extractedFields ? ` (${result.extractedFields} fields)` : "") +
    ` in ${result.timeMs}ms`,
  );

  return result;
}

export const ingestDocumentWorker = new Worker("ingest-document", handler, {
  connection: redis as any,
  concurrency: 2,
  limiter: {
    max: 4,
    duration: 60_000, // max 4 jobs per minute (AI rate limiting)
  },
});

ingestDocumentWorker.on("failed", (job, err) => {
  console.error(`[ingest-document] Job ${job?.id} failed:`, err.message);
});

ingestDocumentWorker.on("completed", (job) => {
  console.log(`[ingest-document] Job ${job?.id} completed`);
});
