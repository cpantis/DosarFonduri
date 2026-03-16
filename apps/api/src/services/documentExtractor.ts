/**
 * DocumentExtractor — unified extraction service with aggressive caching,
 * chunk-based parallel processing, and SSE streaming of results.
 *
 * Pipeline: hash → cache check → text extract (PyMuPDF/docx/xlsx) →
 *           classify → structured extract (AI) → cache store → return
 */

import { createHash } from "crypto";
import { anthropic, withAILimit } from "../lib/anthropic";
import { db } from "../db";
import { extractionCache } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { redis, isRedisReady } from "../lib/redis";
import { publishEvent } from "../lib/sse";
import { logAIUsage } from "./aiUsage";
import {
  extractPDFPages,
  extractTextFromDOCX,
  extractTextFromXLSX,
  classifyDocument,
  type PageResult,
  type DocumentType,
} from "./ocr";


// ─── Types ─────────────────────────────────────────────

export interface ExtractionField {
  path: string;
  value: string | number | boolean | null;
  page_number: number;
  confidence_score: number;
  source_text?: string;
  field_type?: string;
}

export interface ExtractionResult {
  documentId: string;
  contentHash: string;
  documentType: DocumentType;
  classificationConfidence: number;
  language: string;
  hasTables: boolean;
  hasForms: boolean;
  pageCount: number;
  pages: Array<{
    page: number;
    text: string;
    is_scanned: boolean;
    confidence: number;
  }>;
  fields: ExtractionField[];
  structured: Record<string, any>;
  extractionTimeMs: number;
  fromCache: boolean;
}

export interface ExtractOptions {
  organizationId: string;
  documentId: string;
  fileBuffer: Buffer;
  fileName: string;
  fileType: "pdf" | "docx" | "xlsx" | "doc";
  processingType: "ghid" | "template" | "reference_data" | "client_doc" | "reference";
  forceReprocess?: boolean;
  enableET?: boolean;
  sseChannel?: string;
  onProgress?: (progress: number, message: string) => void;
}

// ─── Content Hashing ───────────────────────────────────

export function computeContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

// ─── Cache Layer ───────────────────────────────────────

async function getCachedExtraction(
  contentHash: string,
  extractionType: string,
  organizationId: string,
): Promise<any | null> {
  // Try Redis first (fast path)
  if (isRedisReady()) {
    try {
      const redisKey = `extract:${contentHash}:${extractionType}`;
      const cached = await redis.get(redisKey);
      if (cached) {
        bumpCacheHitCount(contentHash, extractionType, organizationId).catch((e: any) => console.warn("[extractor] cache hit count bump:", e.message));
        return JSON.parse(cached);
      }
    } catch { /* Redis miss */ }
  }

  // Try DB (persistent)
  const row = await db.query.extractionCache.findFirst({
    where: and(
      eq(extractionCache.contentHash, contentHash),
      eq(extractionCache.extractionType, extractionType),
      eq(extractionCache.organizationId, organizationId),
    ),
  });

  if (row) {
    if (isRedisReady()) {
      const redisKey = `extract:${contentHash}:${extractionType}`;
      redis.set(redisKey, JSON.stringify(row.result), "EX", 7 * 86400).catch((e: any) => console.warn("[extractor] redis cache backfill:", e.message));
    }
    bumpCacheHitCount(contentHash, extractionType, organizationId).catch((e: any) => console.warn("[extractor] cache hit count bump:", e.message));
    return row.result;
  }

  return null;
}

async function setCachedExtraction(
  contentHash: string,
  extractionType: string,
  organizationId: string,
  result: any,
  meta?: { modelUsed?: string; tokensUsed?: number; processingTimeMs?: number; pageCount?: number },
): Promise<void> {
  await db.insert(extractionCache).values({
    contentHash,
    extractionType,
    organizationId,
    result,
    pageCount: meta?.pageCount,
    modelUsed: meta?.modelUsed,
    tokensUsed: meta?.tokensUsed,
    processingTimeMs: meta?.processingTimeMs,
  }).onConflictDoUpdate({
    target: [extractionCache.contentHash, extractionCache.extractionType, extractionCache.organizationId],
    set: {
      result,
      modelUsed: meta?.modelUsed,
      tokensUsed: meta?.tokensUsed,
      processingTimeMs: meta?.processingTimeMs,
      createdAt: new Date(),
    },
  });

  if (isRedisReady()) {
    const redisKey = `extract:${contentHash}:${extractionType}`;
    redis.set(redisKey, JSON.stringify(result), "EX", 7 * 86400).catch((e: any) => console.warn("[extractor] redis cache store:", e.message));
  }
}

async function bumpCacheHitCount(
  contentHash: string,
  extractionType: string,
  organizationId: string,
): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE extraction_cache
      SET hit_count = hit_count + 1
      WHERE content_hash = ${contentHash}
        AND extraction_type = ${extractionType}
        AND organization_id = ${organizationId}
    `);
  } catch { /* non-critical */ }
}

// ─── Text Extraction (with caching) ───────────────────

export async function extractText(
  opts: Pick<ExtractOptions, "fileBuffer" | "fileName" | "fileType" | "organizationId"> & { contentHash: string },
): Promise<{ pages: PageResult[]; fullText: string; fromCache: boolean }> {
  const cached = await getCachedExtraction(opts.contentHash, "text", opts.organizationId);
  if (cached) {
    return { pages: cached.pages, fullText: cached.fullText, fromCache: true };
  }

  const startMs = Date.now();
  let pages: PageResult[] = [];
  let fullText = "";

  if (opts.fileType === "pdf") {
    pages = await extractPDFPages(opts.fileBuffer);
    fullText = pages.map(p => `--- Pagina ${p.page} ---\n${p.text}`).join("\n\n");
  } else if (opts.fileType === "docx" || opts.fileType === "doc") {
    fullText = await extractTextFromDOCX(opts.fileBuffer, opts.fileName);
    const pageTexts = fullText.split(/--- Pagina \d+ ---\n?/);
    pages = pageTexts.filter(Boolean).map((text, i) => ({
      page: i + 1, text, is_scanned: false, confidence: 1.0,
    }));
  } else if (opts.fileType === "xlsx") {
    fullText = await extractTextFromXLSX(opts.fileBuffer, opts.fileName);
    const sheetTexts = fullText.split(/--- Sheet: .+ ---\n?/);
    pages = sheetTexts.filter(Boolean).map((text, i) => ({
      page: i + 1, text, is_scanned: false, confidence: 1.0,
    }));
  }

  const elapsed = Date.now() - startMs;
  await setCachedExtraction(opts.contentHash, "text", opts.organizationId, { pages, fullText }, {
    processingTimeMs: elapsed, pageCount: pages.length,
  });

  return { pages, fullText, fromCache: false };
}

// ─── Chunk-Based Parallel Processing ───────────────────

const CHUNK_SIZE = 5;

interface ChunkResult {
  chunkIndex: number;
  pageRange: [number, number];
  fields: ExtractionField[];
  structured: Record<string, any>;
}

async function processChunk(
  chunkPages: PageResult[],
  chunkIndex: number,
  documentType: DocumentType,
  organizationId: string,
  sseChannel?: string,
): Promise<ChunkResult> {
  const pageRange: [number, number] = [
    chunkPages[0].page,
    chunkPages[chunkPages.length - 1].page,
  ];

  const chunkText = chunkPages.map(p => `--- Pagina ${p.page} ---\n${p.text}`).join("\n\n");

  const response = await withAILimit(() => anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: `Ești expert în extragerea datelor structurate din documente românești de finanțare europeană.
Extragi fiecare câmp detectat într-un JSON structurat cu metadate.

REGULI:
- Păstrează structura originală: headings, tabele, liste, numere pagini
- Fiecare câmp extras: path (JSONPath), value, page_number, confidence_score (0-1)
- Pentru tabele: path "table_name.row[i].column_name"
- confidence_score: 1.0=text digital clar, 0.85=OCR bun, 0.5-0.7=text neclar
- Returnează DOAR JSON valid, fără backticks`,
    messages: [{
      role: "user",
      content: `Extrage TOATE datele structurate din paginile ${pageRange[0]}-${pageRange[1]} ale documentului de tip "${documentType}".

Returnează:
{
  "fields": [
    {"path": "...", "value": "...", "page_number": N, "confidence_score": 0.0-1.0, "source_text": "textul original scurt", "field_type": "text|number|date|table|boolean"}
  ],
  "structured": { ... obiect structurat cu datele extrase ... }
}

TEXT:
${chunkText.slice(0, 100000)}`,
    }],
  }));

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: { fields?: ExtractionField[]; structured?: Record<string, any> };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Regex fallback: try to extract JSON from response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = { fields: [], structured: {} }; }
    } else {
      parsed = { fields: [], structured: {} };
    }
    if (!parsed.fields?.length) {
      console.error(
        `[processChunk] JSON parse failed for chunk ${chunkIndex} (pages ${pageRange[0]}-${pageRange[1]}, type "${documentType}"). ` +
        `Response length: ${text.length}, first 300 chars: "${text.slice(0, 300)}"`,
      );
    }
  }

  const fields = parsed.fields || [];

  // Stream each field via SSE
  if (sseChannel && fields.length > 0) {
    for (const field of fields) {
      publishEvent(sseChannel, "field_extracted", { chunkIndex, field }).catch((e: any) => console.warn("[extractor] SSE field_extracted:", e.message));
    }
  }

  await logAIUsage({
    organizationId,
    agent: "ocr",
    model: "claude-sonnet-4-20250514",
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: `extract_chunk_${chunkIndex}`,
  });

  return { chunkIndex, pageRange, fields, structured: parsed.structured || {} };
}

function mergeChunkResults(chunks: ChunkResult[]): { fields: ExtractionField[]; structured: Record<string, any> } {
  chunks.sort((a, b) => a.pageRange[0] - b.pageRange[0]);

  const allFields: ExtractionField[] = [];
  const merged: Record<string, any> = {};

  for (const chunk of chunks) {
    allFields.push(...chunk.fields);
    Object.assign(merged, chunk.structured);
  }

  // Deduplicate by path, keep highest confidence
  const fieldMap = new Map<string, ExtractionField>();
  for (const f of allFields) {
    const existing = fieldMap.get(f.path);
    if (!existing || f.confidence_score > existing.confidence_score) {
      fieldMap.set(f.path, f);
    }
  }

  return { fields: Array.from(fieldMap.values()), structured: merged };
}

// ─── Extended Thinking for Complex Documents ───────────

async function analyzeWithExtendedThinking(
  fullText: string,
  documentType: DocumentType,
  organizationId: string,
  contentHash: string,
): Promise<{ fields: ExtractionField[]; structured: Record<string, any>; reasoning: string }> {
  const cached = await getCachedExtraction(contentHash, "et_analysis", organizationId);
  if (cached) return cached;

  const startMs = Date.now();

  const response = await withAILimit(() => anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 16000,
    thinking: { type: "enabled", budget_tokens: 10000 },
    system: `Ești Solomon — expert senior în dosare de finanțare europeană.
Analizezi documente complexe pas cu pas. Identifică TOATE datele:
- Date implicite (calculate din context)
- Relații între secțiuni
- Valori condiționate
- Tabele complexe (merge cells, spanning rows)
- Referințe încrucișate

Output: JSON cu fields[] + structured{}.
Fiecare field: {path, value, page_number, confidence_score, source_text, field_type}`,
    messages: [{
      role: "user",
      content: `Analiză profundă: document de tip "${documentType}".

Gândește pas cu pas:
1. Tip document și structură?
2. Secțiuni principale?
3. Date explicite?
4. Date derivate/calculate?
5. Inconsistențe/ambiguități?

Returnează JSON: { "fields": [...], "structured": {...} }

TEXT:
${fullText.slice(0, 150000)}`,
    }],
  }));

  let reasoning = "";
  let resultText = "";
  for (const block of response.content) {
    if (block.type === "thinking") reasoning = block.thinking;
    else if (block.type === "text") resultText = block.text;
  }

  const cleaned = resultText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  let parsed: { fields?: ExtractionField[]; structured?: Record<string, any> };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Regex fallback
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = { fields: [], structured: {} }; }
    } else {
      parsed = { fields: [], structured: {} };
    }
    if (!parsed.fields?.length) {
      console.error(
        `[analyzeWithET] JSON parse failed for document type "${documentType}". ` +
        `Response length: ${resultText.length}, first 300 chars: "${resultText.slice(0, 300)}". ` +
        `Reasoning length: ${reasoning.length}`,
      );
    }
  }

  const result = { fields: parsed.fields || [], structured: parsed.structured || {}, reasoning };
  const elapsed = Date.now() - startMs;

  await setCachedExtraction(contentHash, "et_analysis", organizationId, result, {
    modelUsed: "claude-opus-4-6",
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    processingTimeMs: elapsed,
  });

  await logAIUsage({
    organizationId, agent: "ocr", model: "claude-opus-4-6",
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    action: "extended_thinking_analysis",
  });

  return result;
}

// ─── Main Extraction Pipeline ──────────────────────────

export async function extractDocument(opts: ExtractOptions): Promise<ExtractionResult> {
  const startMs = Date.now();
  const contentHash = computeContentHash(opts.fileBuffer);
  const sseChannel = opts.sseChannel;

  const progress = (pct: number, msg: string) => {
    opts.onProgress?.(pct, msg);
    if (sseChannel) {
      publishEvent(sseChannel, "extraction_progress", {
        documentId: opts.documentId, progress: pct, message: msg,
      }).catch((e: any) => console.warn("[extractor] SSE extraction_progress:", e.message));
    }
  };

  // ── Check full result cache ──
  if (!opts.forceReprocess) {
    const cachedFull = await getCachedExtraction(contentHash, `full_${opts.processingType}`, opts.organizationId);
    if (cachedFull) {
      progress(100, "Rezultat din cache (fișier identic procesat anterior)");
      if (sseChannel) {
        publishEvent(sseChannel, "extraction_complete", {
          documentId: opts.documentId, fromCache: true, fieldCount: cachedFull.fields?.length || 0,
        }).catch((e: any) => console.warn("[extractor] SSE extraction_complete:", e.message));
      }
      return { ...cachedFull, documentId: opts.documentId, fromCache: true };
    }
  }

  // ── Step 1: Text extraction ──
  progress(10, "Extragere text din document...");
  const { pages, fullText, fromCache: textFromCache } = await extractText({
    fileBuffer: opts.fileBuffer, fileName: opts.fileName,
    fileType: opts.fileType, organizationId: opts.organizationId, contentHash,
  });

  if (textFromCache) progress(20, "Text din cache, se continuă cu analiza...");
  else progress(25, `Text extras: ${pages.length} pagini`);

  // ── Step 2: Classification ──
  progress(30, "Clasificare document...");
  let classification = await getCachedExtraction(contentHash, "classification", opts.organizationId);
  if (!classification) {
    classification = await classifyDocument(fullText);
    await setCachedExtraction(contentHash, "classification", opts.organizationId, classification, {
      modelUsed: "claude-haiku-4-5-20251001",
    });
  }
  progress(40, `Clasificat: ${classification.documentType} (${Math.round(classification.confidence * 100)}%)`);

  // ── Step 3: Structured extraction (chunk-based parallel) ──
  let fields: ExtractionField[] = [];
  let structured: Record<string, any> = {};

  const isComplex = pages.length > 10 || classification.hasTables || classification.hasForms;

  if (pages.length > CHUNK_SIZE) {
    progress(45, `Procesare în ${Math.ceil(pages.length / CHUNK_SIZE)} chunk-uri paralele...`);

    const chunks: PageResult[][] = [];
    for (let i = 0; i < pages.length; i += CHUNK_SIZE) {
      chunks.push(pages.slice(i, i + CHUNK_SIZE));
    }

    // Process in batches of 3 to respect rate limits
    const BATCH_SIZE = 3;
    const allChunkResults: ChunkResult[] = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE).map((chunk, idx) =>
        processChunk(chunk, i + idx, classification.documentType, opts.organizationId, sseChannel)
      );
      const batchResults = await Promise.all(batch);
      allChunkResults.push(...batchResults);
      const pct = 45 + Math.round(((i + BATCH_SIZE) / chunks.length) * 35);
      progress(Math.min(pct, 80), `Chunk-uri procesate: ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length}`);
    }

    const merged = mergeChunkResults(allChunkResults);
    fields = merged.fields;
    structured = merged.structured;
  } else if (pages.length > 0) {
    progress(50, "Extragere date structurate...");
    const result = await processChunk(pages, 0, classification.documentType, opts.organizationId, sseChannel);
    fields = result.fields;
    structured = result.structured;
  }

  progress(80, `${fields.length} câmpuri extrase`);

  // ── Step 4: Extended Thinking for complex docs ──
  if (opts.enableET && isComplex) {
    progress(85, "Analiză extinsă cu Extended Thinking...");
    const etResult = await analyzeWithExtendedThinking(
      fullText, classification.documentType, opts.organizationId, contentHash,
    );

    const fieldMap = new Map<string, ExtractionField>();
    for (const f of fields) fieldMap.set(f.path, f);
    for (const f of etResult.fields) {
      const existing = fieldMap.get(f.path);
      if (!existing || f.confidence_score > existing.confidence_score) {
        fieldMap.set(f.path, f);
      }
    }
    fields = Array.from(fieldMap.values());
    structured = { ...structured, ...etResult.structured, _et_reasoning: etResult.reasoning };
  }

  progress(95, "Salvare rezultate...");

  // ── Build final result ──
  const extractionTimeMs = Date.now() - startMs;
  const result: ExtractionResult = {
    documentId: opts.documentId,
    contentHash,
    documentType: classification.documentType,
    classificationConfidence: classification.confidence,
    language: classification.language,
    hasTables: classification.hasTables,
    hasForms: classification.hasForms,
    pageCount: pages.length,
    pages: pages.map(p => ({
      page: p.page, text: p.text.slice(0, 2000),
      is_scanned: p.is_scanned, confidence: p.confidence,
    })),
    fields,
    structured,
    extractionTimeMs,
    fromCache: false,
  };

  // ── Cache full result ──
  await setCachedExtraction(contentHash, `full_${opts.processingType}`, opts.organizationId, result, {
    processingTimeMs: extractionTimeMs, pageCount: pages.length,
  });

  progress(100, `Extragere completă: ${fields.length} câmpuri, ${pages.length} pagini`);

  if (sseChannel) {
    publishEvent(sseChannel, "extraction_complete", {
      documentId: opts.documentId, fromCache: false,
      fieldCount: fields.length, pageCount: pages.length,
      extractionTimeMs, documentType: classification.documentType,
    }).catch((e: any) => console.warn("[extractor] SSE extraction_complete:", e.message));
  }

  return result;
}

// ─── Utility: get cached text for a document hash ──────

export async function getCachedText(contentHash: string, organizationId: string): Promise<string | null> {
  const cached = await getCachedExtraction(contentHash, "text", organizationId);
  return cached?.fullText || null;
}

// ─── Utility: invalidate cache for a hash ──────────────

export async function invalidateCache(contentHash: string, organizationId: string): Promise<void> {
  await db.delete(extractionCache).where(
    and(
      eq(extractionCache.contentHash, contentHash),
      eq(extractionCache.organizationId, organizationId),
    ),
  );

  if (isRedisReady()) {
    const pattern = `extract:${contentHash}:*`;
    // Use SCAN instead of KEYS to avoid blocking Redis on large keyspaces
    const stream = redis.scanStream({ match: pattern, count: 100 });
    const keysToDelete: string[] = [];
    for await (const batch of stream) {
      keysToDelete.push(...(batch as string[]));
    }
    if (keysToDelete.length > 0) await redis.del(...keysToDelete);
  }
}

// ─── Cache Stats (for admin panel) ─────────────────────

export async function getCacheStats(organizationId: string): Promise<{
  totalEntries: number;
  totalHits: number;
  topTypes: Array<{ type: string; count: number }>;
}> {
  const entries = await db.query.extractionCache.findMany({
    where: eq(extractionCache.organizationId, organizationId),
  });

  const typeCount = new Map<string, number>();
  let totalHits = 0;
  for (const e of entries) {
    totalHits += e.hitCount;
    typeCount.set(e.extractionType, (typeCount.get(e.extractionType) || 0) + 1);
  }

  return {
    totalEntries: entries.length,
    totalHits,
    topTypes: Array.from(typeCount.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
  };
}
