import { Worker, Job } from "bullmq";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { documents, guideReferenceTables } from "../db/schema";
import { eq } from "drizzle-orm";
import { getFileBuffer } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX } from "../services/ocr";
import { logAIUsage } from "../services/aiUsage";
import { publishEvent } from "../lib/sse";

const anthropic = new Anthropic();

interface ProcessReferenceDataPayload {
  documentId: string;
  organizationId: string;
}

async function extractTables(
  text: string,
  model: string,
  documentId: string,
  organizationId: string,
): Promise<void> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: `Extragi tabele structurate din anexele ghidurilor de finanțare europeană.
Fiecare tabel are un scop de lookup, clasificare sau listare.
Returnează DOAR JSON valid — array de obiecte. Fără backticks.`,
    messages: [{
      role: "user",
      content: `Extrage TOATE tabelele structurate din acest document.

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
${text.slice(0, 80000)}`,
    }],
  });

  const content = response.content[0].type === "text" ? response.content[0].text : "[]";
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: any[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse reference tables JSON");
    parsed = [];
  }

  if (parsed.length > 0) {
    await db.insert(guideReferenceTables).values(
      parsed.map((t: any) => ({
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
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: "extract_reference_tables",
  });
}

export const processReferenceDataWorker = new Worker<ProcessReferenceDataPayload>(
  "process-reference-data",
  async (job: Job<ProcessReferenceDataPayload>) => {
    const { documentId, organizationId } = job.data;

    try {
      await db.update(documents).set({ status: "processing" }).where(eq(documents.id, documentId));

      const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
      if (!doc) throw new Error("Document not found");

      const { buffer, name: fileName } = await getFileBuffer(doc.fileId);

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
      await db.update(documents).set({ status: docStatus as any }).where(eq(documents.id, documentId));

      publishEvent(`org:${organizationId}:uploads`, "document_failed", {
        documentId,
        status: docStatus,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts || 3,
        willRetry: !isLastAttempt,
        message: isLastAttempt
          ? `Eroare la extragerea tabelelor de referință (toate ${job.opts.attempts || 3} încercări eșuate)`
          : `Eroare la extragerea tabelelor (încercare ${job.attemptsMade + 1}/${job.opts.attempts || 3}, se reîncearcă)`,
      }).catch(() => {});
      throw error;
    }
  },
  { connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || "6379") } }
);
