/**
 * Process strategic reference documents (PNIESC, PNRR, regulations, strategies).
 *
 * Extracts key sections relevant for funding consultants and saves them
 * as solomonKnowledge entries — accessible by Solomon and Neemia automatically.
 *
 * Unlike guide processing (rules, scoring, elements), reference processing
 * extracts: objectives, targets, measures, priorities, statistics, definitions.
 */
import { Worker, Job } from "bullmq";
import { db } from "../db";
import { documents, solomonKnowledge } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getFileBuffer } from "../services/storage";
import { extractTextFromPDF, extractTextFromDOCX, extractTextFromXLSX } from "../services/ocr";
import { logAIUsage } from "../services/aiUsage";
import { publishEvent, publishJobProgress } from "../lib/sse";
import { anthropic, withAILimit } from "../lib/anthropic";
import { redis } from "../lib/redis";
import { repairTruncatedJSON } from "../lib/safeExtract";

const MODEL = "claude-sonnet-4-6";
const CHUNK_CHAR_LIMIT = 120000; // larger chunks for context — references need broad context
const MAX_PARALLEL_CHUNKS = 2;

const REFERENCE_SYSTEM = `Ești Solomon — consultant senior cu 15+ ani experiență în fonduri europene.
Citești un document strategic/legislativ (NU un ghid de finanțare) și extragi informațiile
pe care un consultant le folosește pentru:
1. JUSTIFICAREA proiectelor — obiective naționale, target-uri, priorități
2. ARGUMENTAREA punctajului — date statistice, cifre oficiale
3. CONTEXT LEGISLATIV — definiții, cadru legal, termene
4. REFERINȚE CITABILE — paragrafe exacte pe care consultantul le copiază în cererea de finanțare

NU extragi reguli de eligibilitate sau criterii de selecție — acesta NU e un ghid de finanțare.
Extragi CUNOȘTINȚE pe care consultantul le folosește ca fundament strategic.

Returnează DOAR JSON valid. Fără backticks, fără explicații.`;

const REFERENCE_USER = (guideText: string) => `Extrage secțiunile-cheie din acest document strategic.

Pentru FIECARE secțiune relevantă, creează o intrare cu:
- title: titlul clar și descriptiv
- category: "obiective" | "target_cifre" | "masuri_politici" | "cadru_legal" | "definitii" | "statistici" | "prioritati" | "calendar"
- content: textul COMPLET al secțiunii (nu rezuma — consultantul are nevoie de textul exact pentru a cita)
- source_page: pagina din document
- source_reference: "Numele documentului, secțiunea X, pag. Y"
- relevance: pentru ce programe/măsuri de finanțare este relevant (ex: "energie regenerabilă", "eficiență energetică", "transport verde")

Returnează: { "sections": [{ "title": "...", "category": "...", "content": "...", "source_page": N, "source_reference": "...", "relevance": "..." }] }

Fii EXHAUSTIV — un consultant nu își permite să rateze o cifră oficială sau un obiectiv strategic.
Concentrează-te pe: cifre concrete, procente, target-uri cu an, măsuri specifice, definiții oficiale.

TEXT DOCUMENT:
${guideText}`;

/** Split text into chunks respecting page boundaries */
function splitReferenceText(text: string): string[] {
  if (text.length <= CHUNK_CHAR_LIMIT) return [text];

  const pageDelimiter = /--- Pagina \d+/g;
  const pageStarts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pageDelimiter.exec(text)) !== null) {
    pageStarts.push(match.index);
  }
  if (pageStarts.length <= 1) return [text];

  const chunks: string[] = [];
  let chunkStart = 0;
  while (chunkStart < pageStarts.length) {
    let chunkEnd = chunkStart;
    for (let i = chunkStart + 1; i < pageStarts.length; i++) {
      if (pageStarts[i] - pageStarts[chunkStart] > CHUNK_CHAR_LIMIT) break;
      chunkEnd = i;
    }
    const startIdx = pageStarts[chunkStart];
    const endIdx = chunkEnd + 1 < pageStarts.length ? pageStarts[chunkEnd + 1] : text.length;
    chunks.push(text.slice(startIdx, endIdx));
    chunkStart = chunkEnd + 1;
    if (chunkEnd >= pageStarts.length - 1) break;
  }
  return chunks;
}

async function extractReferenceSections(
  chunkText: string,
  organizationId: string,
  label: string,
): Promise<Array<{ title: string; category: string; content: string; sourcePage: number | null; sourceReference: string; relevance: string }>> {
  const cachedSystem: any[] = [
    { type: "text", text: REFERENCE_SYSTEM, cache_control: { type: "ephemeral" } },
  ];

  const requestParams: any = {
    model: MODEL,
    max_tokens: 16000,
    system: cachedSystem,
    messages: [{ role: "user", content: REFERENCE_USER(chunkText) }],
  };

  const callStart = Date.now();
  const response: any = await withAILimit(() => (anthropic.messages.create as any)(requestParams));
  const duration = Date.now() - callStart;

  const textBlock = response.content.find((b: any) => b.type === "text");
  const content = textBlock ? textBlock.text : "";

  console.log(`[processReference] ${label} ${duration}ms in=${response.usage.input_tokens} out=${response.usage.output_tokens}`);

  await logAIUsage({
    organizationId,
    agent: "reference_extractor",
    model: MODEL,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: `extract_${label}`,
  });

  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  let parsed: any = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = repairTruncatedJSON(content);
    if (!parsed) {
      console.error(`[processReference] Failed to parse ${label}`);
      return [];
    }
  }

  return Array.isArray(parsed.sections) ? parsed.sections : Array.isArray(parsed) ? parsed : [];
}

// ─── DETECT DOCUMENT TYPE ───

export async function detectDocumentType(
  text: string,
  organizationId: string,
): Promise<"ghid" | "referinta_strategica" | "unknown"> {
  // Quick heuristic first (zero AI cost)
  const sample = text.slice(0, 10000).toLowerCase();
  const guideSignals = ["eligibil", "neeligibil", "solicitant", "punctaj", "criteriu de selecție", "cerere de finanțare", "checklist", "grila de evaluare"];
  const refSignals = ["obiectiv strategic", "plan național", "strategie", "target 2030", "emisii", "politici publice", "directiva ue"];

  const guideScore = guideSignals.filter(s => sample.includes(s)).length;
  const refScore = refSignals.filter(s => sample.includes(s)).length;

  if (guideScore >= 3) return "ghid";
  if (refScore >= 3) return "referinta_strategica";
  if (guideScore > refScore) return "ghid";
  if (refScore > guideScore) return "referinta_strategica";
  return "unknown";
}

// ─── MAIN WORKER ───

interface ProcessReferencePayload {
  documentId: string;
  organizationId: string;
}

export const processReferenceDocWorker = new Worker<ProcessReferencePayload>(
  "process-reference-doc",
  async (job: Job<ProcessReferencePayload>) => {
    const { documentId, organizationId } = job.data;
    const startTime = Date.now();

    try {
      await db.update(documents).set({ status: "processing", processingError: null }).where(eq(documents.id, documentId));

      const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
      if (!doc) throw new Error("Document not found");

      const { buffer, name: fileName } = await getFileBuffer(doc.fileId);

      // Step 1: Extract text
      let rawText = "";
      if (doc.fileType === "pdf") {
        const pdfResult = await extractTextFromPDF(buffer);
        rawText = pdfResult.text;
      } else if (doc.fileType === "docx" || doc.fileType === "doc") {
        rawText = await extractTextFromDOCX(buffer, fileName);
      } else if (doc.fileType === "xlsx") {
        rawText = await extractTextFromXLSX(buffer, fileName);
      }

      const totalPages = (rawText.match(/--- Pagina \d+/g) || []).length;
      const totalChars = rawText.length;

      console.log(`[processReference] Text extraction: ${totalPages} pagini, ${totalChars} chars`);

      // Time estimate
      const chunks = splitReferenceText(rawText);
      const estMinutes = Math.ceil((Math.ceil(chunks.length / MAX_PARALLEL_CHUNKS) * 40 + 10) / 60);

      publishJobProgress(organizationId, {
        jobId: job.id || "",
        jobType: "referinta",
        documentId,
        documentName: doc.name,
        progress: 10,
        status: "processing",
        message: `Analizez ${totalPages} pagini — extragere secțiuni relevante in ~${estMinutes} ${estMinutes === 1 ? "minut" : "minute"}`,
      }).catch(() => {});

      // Step 2: Extract sections from chunks
      const allSections: Array<{ title: string; category: string; content: string; sourcePage: number | null; sourceReference: string; relevance: string }> = [];

      // Process chunks with limited parallelism
      const chunkQueue = chunks.map((_, i) => i);
      async function worker() {
        let idx: number | undefined;
        while ((idx = chunkQueue.shift()) !== undefined) {
          const sections = await extractReferenceSections(chunks[idx], organizationId, `chunk_${idx + 1}`);
          allSections.push(...sections);
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(MAX_PARALLEL_CHUNKS, chunks.length) }, () => worker()),
      );

      console.log(`[processReference] Extracted ${allSections.length} sections from ${chunks.length} chunks`);

      publishJobProgress(organizationId, {
        jobId: job.id || "",
        jobType: "referinta",
        documentId,
        documentName: doc.name,
        progress: 80,
        status: "processing",
        message: `${allSections.length} secțiuni extrase. Salvez in baza de cunoștințe...`,
      }).catch(() => {});

      // Step 3: Save to solomonKnowledge
      // Delete existing entries from this document (for reprocessing)
      await db.delete(solomonKnowledge).where(
        and(
          eq(solomonKnowledge.organizationId, organizationId),
          eq(solomonKnowledge.sourceReference, `doc:${documentId}`),
        ),
      );

      let savedCount = 0;
      for (const section of allSections) {
        if (!section.title || !section.content) continue;
        try {
          await db.insert(solomonKnowledge).values({
            organizationId,
            category: `referinta_${section.category || "general"}`,
            title: `${doc.name} — ${section.title}`.slice(0, 500),
            content: section.content,
            sourceReference: `doc:${documentId}`,
            sourceUrl: null,
            validFrom: null,
            validUntil: null,
            priority: 5, // reference docs have lower priority than manual knowledge
            enabled: true,
          });
          savedCount++;
        } catch (err: any) {
          console.warn(`[processReference] Failed to save section "${section.title}":`, err.message?.slice(0, 100));
        }
      }

      console.log(`[processReference] Saved ${savedCount}/${allSections.length} sections to solomonKnowledge`);

      // Step 4: Update document
      const totalDuration = Date.now() - startTime;
      await db.update(documents).set({
        status: "processed",
        pageCount: totalPages,
        documentTypeClass: "reference_strategic" as any,
        processingResult: {
          document_type: "referinta_strategica",
          sections_extracted: savedCount,
          total_pages: totalPages,
          total_chars: totalChars,
          chunks_processed: chunks.length,
          processing_time_ms: totalDuration,
        },
        processedAt: new Date(),
      }).where(eq(documents.id, documentId));

      publishJobProgress(organizationId, {
        jobId: job.id || "",
        jobType: "referinta",
        documentId,
        documentName: doc.name,
        progress: 100,
        status: "completed",
        message: `${savedCount} secțiuni extrase din "${doc.name}" — disponibile in Solomon și Neemia`,
      }).catch(() => {});

      publishEvent(`org:${organizationId}:uploads`, "document_processed", {
        documentId,
        documentName: doc.name,
        status: "processed",
        processingType: "referinta_strategica",
        sectionsExtracted: savedCount,
        totalPages,
        durationMs: totalDuration,
        message: `Referință procesată: ${savedCount} secțiuni strategice extrase din ${totalPages} pagini.`,
      }).catch(() => {});

    } catch (error) {
      const isLastAttempt = (job.attemptsMade + 1) >= (job.opts.attempts || 3);
      const errorMsg = error instanceof Error ? error.message : "Eroare necunoscută";
      await db.update(documents).set({ status: isLastAttempt ? "failed" : "error", processingError: errorMsg }).where(eq(documents.id, documentId));
      throw error;
    }
  },
  {
    connection: redis as any,
    concurrency: 1,
    limiter: { max: 2, duration: 60000 },
  },
);
