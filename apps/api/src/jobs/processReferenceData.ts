import { Worker, Job } from "bullmq";
import { db } from "../db";
import { documents, guideReferenceTables } from "../db/schema";
import { eq } from "drizzle-orm";
import { getFileBuffer } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX } from "../services/ocr";
import { logAIUsage } from "../services/aiUsage";
import { publishEvent } from "../lib/sse";
import { redis } from "../lib/redis";
import { anthropic, withAILimit } from "../lib/anthropic";

interface ProcessReferenceDataPayload {
  documentId: string;
  organizationId: string;
}

const CHUNK_CHAR_LIMIT = 80000;
const MAX_CHUNK_CONCURRENCY = 3;

/**
 * Split text into chunks at page boundaries (--- Pagina N ---),
 * each chunk staying under CHUNK_CHAR_LIMIT.
 */
function splitTextIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_CHAR_LIMIT) return [text];

  const pageMarker = /^--- Pagina \d+/gm;
  const pageStarts: number[] = [0];
  let m: RegExpExecArray | null;
  while ((m = pageMarker.exec(text)) !== null) {
    pageStarts.push(m.index);
  }

  const chunks: string[] = [];
  let currentChunk = "";

  for (let i = 0; i < pageStarts.length; i++) {
    const end = i + 1 < pageStarts.length ? pageStarts[i + 1] : text.length;
    const pageText = text.slice(pageStarts[i], end);

    if (currentChunk.length + pageText.length > CHUNK_CHAR_LIMIT && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = pageText;
    } else {
      currentChunk += pageText;
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

const TABLE_EXTRACTION_SYSTEM = `Extragi tabele structurate din anexele ghidurilor de finanțare europeană.
Fiecare tabel are un scop de lookup, clasificare sau listare.
Returnează DOAR JSON valid — array de obiecte. Fără backticks.`;

const TABLE_EXTRACTION_PROMPT = (chunkText: string, chunkInfo: string) => `Extrage TOATE tabelele structurate din acest document.${chunkInfo}

Pentru fiecare tabel returnează:
{
  "name": "Numele tabelului (ex: Tabel 1 - Corelatie suprafata-putere)",
  "description": "Ce contine tabelul si la ce serveste",
  "table_type": "lookup" | "classification" | "list" | "matrix",
  "columns_schema": [{"key": "col_id", "label": "Nume coloana", "type": "string|number|range"}],
  "rows_data": [{"col_id": "valoare", ...}],
  "lookup_key": "coloana pe care se face cautarea (daca e lookup)",
  "source_page": numar_pagina,
  "exceptions": ["exceptii textuale relevante"]
}

TEXT DOCUMENT:
${chunkText}`;

async function extractTablesFromChunk(
  chunkText: string,
  chunkInfo: string,
  model: string,
): Promise<{ tables: any[]; usage: { input_tokens: number; output_tokens: number } }> {
  const response = await withAILimit(() => anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: TABLE_EXTRACTION_SYSTEM,
    messages: [{ role: "user", content: TABLE_EXTRACTION_PROMPT(chunkText, chunkInfo) }],
  }));

  const content = response.content[0].type === "text" ? response.content[0].text : "[]";
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) parsed = [parsed];
  } catch {
    console.error("Failed to parse reference tables JSON from chunk");
    parsed = [];
  }

  return { tables: parsed, usage: response.usage };
}

async function extractTables(
  text: string,
  model: string,
  documentId: string,
  organizationId: string,
): Promise<void> {
  const chunks = splitTextIntoChunks(text);
  const allTables: any[] = [];
  let totalInput = 0;
  let totalOutput = 0;

  // Process chunks with concurrency limit
  for (let i = 0; i < chunks.length; i += MAX_CHUNK_CONCURRENCY) {
    const batch = chunks.slice(i, i + MAX_CHUNK_CONCURRENCY);
    const results = await Promise.all(
      batch.map((chunk, j) => {
        const idx = i + j;
        const chunkInfo = chunks.length > 1
          ? `\n\nAcesta este chunk-ul ${idx + 1} din ${chunks.length}. Extrage doar tabelele din această secțiune.`
          : "";
        return extractTablesFromChunk(chunk, chunkInfo, model);
      })
    );
    for (const r of results) {
      allTables.push(...r.tables);
      totalInput += r.usage.input_tokens;
      totalOutput += r.usage.output_tokens;
    }
  }

  // Deduplicate tables by name (keep first occurrence)
  const seen = new Set<string>();
  const dedupedTables = allTables.filter((t) => {
    const key = (t.name || "").toLowerCase().trim();
    if (!key || !seen.has(key)) {
      if (key) seen.add(key);
      return true;
    }
    return false;
  });

  if (dedupedTables.length > 0) {
    await db.insert(guideReferenceTables).values(
      dedupedTables.map((t: any) => ({
        documentId,
        organizationId,
        name: t.name || "Tabel fără nume",
        description: t.description || null,
        tableType: t.table_type || "lookup",
        schema: t.columns_schema || [],
        data: t.rows_data || [],
        lookupKey: t.lookup_key || null,
        sourcePage: t.source_page || null,
        sourceText: t.exceptions?.join("; ") || null,
        extractedBy: "ai" as const,
      }))
    );
  }

  await logAIUsage({
    organizationId,
    agent: "ghid_rules",
    model,
    tokensInput: totalInput,
    tokensOutput: totalOutput,
    action: "extract_reference_tables",
  });
}

export const processReferenceDataWorker = new Worker<ProcessReferenceDataPayload>(
  "process-reference-data",
  async (job: Job<ProcessReferenceDataPayload>) => {
    const { documentId, organizationId } = job.data;

    try {
      await db.update(documents).set({ status: "processing", processingError: null }).where(eq(documents.id, documentId));

      const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
      if (!doc) throw new Error("Document not found");

      const { buffer, name: fileName } = await getFileBuffer(doc.fileId);

      let text = "";
      if (doc.fileType === "pdf") {
        text = (await extractTextFromPDF(buffer)).text;
      } else if (doc.fileType === "docx" || doc.fileType === "doc") {
        text = await extractTextFromDOCX(buffer, fileName);
      } else if (doc.fileType === "xlsx") {
        text = await extractTextFromXLSX(buffer, fileName);
      } else {
        throw new Error(`Format nesuportat: ${doc.fileType}`);
      }

      await job.updateProgress(30);

      // Extract structured tables
      await extractTables(text, "claude-sonnet-4-20250514", documentId, organizationId);

      await job.updateProgress(90);

      const pageCount = (text.match(/--- Pagina|--- Sheet/g) || []).length || 1;
      await db.update(documents).set({
        status: "processed",
        pageCount,
        processedAt: new Date(),
      }).where(eq(documents.id, documentId));

      await job.updateProgress(100);

      // SSE notification
      publishEvent(`org:${organizationId}:uploads`, "document_processed", {
        documentId,
        documentName: doc.name,
        status: "processed",
        processingType: "reference_data",
        message: `Tabele de referință extrase din "${doc.name}"`,
      }).catch(() => {});

    } catch (error) {
      console.error(`Process reference data error (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 3}):`, error);

      const isLastAttempt = (job.attemptsMade + 1) >= (job.opts.attempts || 3);
      const docStatus = isLastAttempt ? "failed" : "error";
      const errorMsg = error instanceof Error ? error.message : "Eroare necunoscută";
      await db.update(documents).set({ status: docStatus as any, processingError: errorMsg }).where(eq(documents.id, documentId));

      publishEvent(`org:${organizationId}:uploads`, "document_failed", {
        documentId,
        status: docStatus,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts || 3,
        willRetry: !isLastAttempt,
        errorMessage: errorMsg,
        message: isLastAttempt
          ? `Eroare la extragerea tabelelor de referință (toate ${job.opts.attempts || 3} încercări eșuate): ${errorMsg}`
          : `Eroare la extragerea tabelelor (încercare ${job.attemptsMade + 1}/${job.opts.attempts || 3}, se reîncearcă): ${errorMsg}`,
      }).catch(() => {});
      throw error;
    }
  },
  { connection: redis as any }
);
