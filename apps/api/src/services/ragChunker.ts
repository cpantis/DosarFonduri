/**
 * RAG v2 — Universal document chunker.
 *
 * Adapted from guideChunker.ts with different parameters:
 * - Target: 400 tokens (vs 500 for guide chunks)
 * - Max: 600 tokens
 * - Overlap: ~40 tokens (10%)
 * - Works with any document type, not just guides
 *
 * guideChunker.ts remains for the existing pipeline.
 */

const TARGET_CHUNK_TOKENS = 400;
const MAX_CHUNK_TOKENS = 600;
const OVERLAP_TOKENS = 40;

/** Approximate token count (~3.5 chars/token for Romanian text) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export interface RagChunk {
  index: number;
  content: string;
  tokenCount: number;
  pageStart: number | null;
  pageEnd: number | null;
}

/** Parse "--- Pagina N ---" delimited text into page objects */
function parsePages(fullText: string): Array<{ page: number; text: string }> {
  const pageDelimiter = /--- Pagina (\d+).*?---/g;
  const pageStarts: Array<{ page: number; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = pageDelimiter.exec(fullText)) !== null) {
    pageStarts.push({ page: parseInt(m[1], 10), start: m.index });
  }

  const pages: Array<{ page: number; text: string }> = [];
  for (let i = 0; i < pageStarts.length; i++) {
    const end = i + 1 < pageStarts.length ? pageStarts[i + 1].start : fullText.length;
    const rawText = fullText.slice(pageStarts[i].start, end);
    const contentStart = rawText.indexOf("\n") + 1;
    pages.push({ page: pageStarts[i].page, text: rawText.slice(contentStart).trim() });
  }

  // If no page delimiters found, treat entire text as one page
  if (pages.length === 0 && fullText.trim().length > 0) {
    pages.push({ page: 1, text: fullText.trim() });
  }

  return pages;
}

/**
 * Chunk any document text into RAG-ready chunks.
 *
 * @param fullText - Full OCR text (with "--- Pagina N ---" delimiters)
 * @returns Array of chunks with page references
 */
export function chunkDocument(fullText: string): RagChunk[] {
  const pages = parsePages(fullText);
  const chunks: RagChunk[] = [];
  let currentParts: string[] = [];
  let currentTokens = 0;
  let currentPageStart: number | null = null;
  let currentPageEnd: number | null = null;

  function flushChunk() {
    if (currentParts.length === 0) return;
    const content = currentParts.join("\n\n");
    chunks.push({
      index: chunks.length,
      content,
      tokenCount: estimateTokens(content),
      pageStart: currentPageStart,
      pageEnd: currentPageEnd,
    });
    // Overlap: keep last paragraph if within overlap budget
    const lastPart = currentParts[currentParts.length - 1];
    const lastTokens = estimateTokens(lastPart);
    if (lastTokens <= OVERLAP_TOKENS) {
      currentParts = [lastPart];
      currentTokens = lastTokens;
    } else {
      currentParts = [];
      currentTokens = 0;
    }
    currentPageStart = null;
    currentPageEnd = null;
  }

  for (const page of pages) {
    const paragraphs = page.text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    for (const para of paragraphs) {
      const paraTokens = estimateTokens(para);

      // If single paragraph exceeds max, split by sentences
      if (paraTokens > MAX_CHUNK_TOKENS) {
        if (currentParts.length > 0) flushChunk();
        const sentences = para.split(/(?<=[.;:])\s+/);
        for (const sentence of sentences) {
          const sentTokens = estimateTokens(sentence);
          if (currentTokens + sentTokens > TARGET_CHUNK_TOKENS && currentParts.length > 0) {
            if (currentPageStart === null) currentPageStart = page.page;
            currentPageEnd = page.page;
            flushChunk();
          }
          currentParts.push(sentence);
          currentTokens += sentTokens;
          if (currentPageStart === null) currentPageStart = page.page;
          currentPageEnd = page.page;
        }
        continue;
      }

      // Would exceed target? Flush.
      if (currentTokens + paraTokens > TARGET_CHUNK_TOKENS && currentParts.length > 0) {
        flushChunk();
      }

      currentParts.push(para);
      currentTokens += paraTokens;
      if (currentPageStart === null) currentPageStart = page.page;
      currentPageEnd = page.page;
    }
  }

  // Flush remaining
  flushChunk();

  return chunks;
}
