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
import { splitTextIntoChunks, safeJSONParse, checkExtractionQuality } from "../lib/safeExtract";

interface ProcessReferenceDataPayload {
  documentId: string;
  organizationId: string;
}

const CHUNK_CHAR_LIMIT = 80000;
const CHUNK_OVERLAP_PAGES = 2;
const MAX_CHUNK_CONCURRENCY = 3;

const TABLE_EXTRACTION_SYSTEM = `Ești expert în fonduri europene. Extragi tabele structurate din anexele ghidurilor de finanțare.

DE CE CONTEAZĂ: Aceste tabele sunt CRITICE — Solomon le folosește pentru a valida automat datele beneficiarului. Un tabel extras greșit = o validare greșită = un dosar respins.

CUM GÂNDEȘTI:
- Fiecare tabel are un ROL: lookup (caută o valoare), clasificare (încadrează într-o categorie), matrice (intersecție rând×coloană), listă (enumerare exhaustivă)
- Identifică CHEIA DE CĂUTARE — pe ce coloană se face lookup-ul? (ex: suprafață fermă → putere tractor)
- Păstrează TOATE rândurile, inclusiv excepții și note de subsol — o notă omisă poate schimba interpretarea
- Dacă un tabel are valori "de la X la Y", transformă în range-uri structurate (min/max), nu text liber
- Dacă tabelul se referă la un alt tabel sau la o condiție, capturează în "exceptions"

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
): Promise<{ tables: any[]; usage: { input_tokens: number; output_tokens: number }; truncated: boolean }> {
  const response = await withAILimit(() => anthropic.messages.create({
    model,
    max_tokens: 12000, // Increased from 8000 — complex tables need more output space
    system: TABLE_EXTRACTION_SYSTEM,
    messages: [{ role: "user", content: TABLE_EXTRACTION_PROMPT(chunkText, chunkInfo) }],
  }));

  const content = response.content[0].type === "text" ? response.content[0].text : "[]";
  const wasTruncated = response.stop_reason === "max_tokens";

  if (wasTruncated) {
    console.warn(`[processReferenceData] Chunk truncated at ${content.length} chars — attempting continuation...`);

    // One continuation attempt for tables
    const contResponse = await withAILimit(() => anthropic.messages.create({
      model,
      max_tokens: 12000,
      system: TABLE_EXTRACTION_SYSTEM + "\n\nContinuă JSON-ul trunchiat. NU repeta ce a fost generat anterior.",
      messages: [
        { role: "user", content: TABLE_EXTRACTION_PROMPT(chunkText, chunkInfo) },
        { role: "assistant", content },
        { role: "user", content: "JSON-ul a fost trunchiat. Continuă EXACT de unde ai rămas:" },
      ],
    }));

    const contText = contResponse.content[0].type === "text" ? contResponse.content[0].text : "";
    const fullText = content + contText;

    const parsed = safeJSONParse(fullText, "refData_chunk");
    let tables: any[] = [];
    if (parsed) {
      tables = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    }

    return {
      tables,
      usage: {
        input_tokens: response.usage.input_tokens + contResponse.usage.input_tokens,
        output_tokens: response.usage.output_tokens + contResponse.usage.output_tokens,
      },
      truncated: true,
    };
  }

  // Normal (non-truncated) path
  const parsed = safeJSONParse(content, "refData_chunk");
  let tables: any[] = [];
  if (parsed) {
    tables = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  } else {
    console.error(`[processReferenceData] CRITICAL: Failed to parse reference tables JSON from chunk (${content.length} chars)`);
  }

  return { tables, usage: response.usage, truncated: false };
}

async function extractTables(
  text: string,
  model: string,
  documentId: string,
  organizationId: string,
): Promise<void> {
  const chunks = splitTextIntoChunks(text, CHUNK_CHAR_LIMIT, CHUNK_OVERLAP_PAGES);
  const allTables: any[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let anyTruncated = false;

  console.log(`[processReferenceData] Processing ${chunks.length} chunk(s) with ${CHUNK_OVERLAP_PAGES}-page overlap`);

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
      if (r.truncated) anyTruncated = true;
    }
  }

  // Deduplicate tables by name + source_page (more precise than name alone)
  const seen = new Set<string>();
  const dedupedTables = allTables.filter((t) => {
    const name = (t.name || "").toLowerCase().trim();
    const page = t.source_page || 0;
    const key = `${name}|p${page}`;
    if (!key || !seen.has(key)) {
      if (name) seen.add(key);
      return true;
    }
    return false;
  });

  const dedupRemoved = allTables.length - dedupedTables.length;
  if (dedupRemoved > 0) {
    console.log(`[processReferenceData] Dedup: ${allTables.length} raw → ${dedupedTables.length} unique (removed ${dedupRemoved} duplicates from overlap)`);
  }

  // Quality check
  checkExtractionQuality("processReferenceData", text.length, dedupedTables.length, 1);

  if (anyTruncated) {
    console.warn(`[processReferenceData] Some chunks were truncated — table data may be incomplete`);
  }

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
      await extractTables(text, "claude-sonnet-4-6-20250514", documentId, organizationId);

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
      }).catch((e: any) => console.warn("[processReferenceData] sse document processed:", e.message));

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
      }).catch((e: any) => console.warn("[processReferenceData] sse document failed:", e.message));
      throw error;
    }
  },
  { connection: redis as any }
);
