/**
 * Smart guide chunking for RAG pipeline.
 *
 * Strategy: page-aware, section-aware semantic chunking.
 * - Respects page boundaries (never splits mid-page if possible)
 * - Uses guide metadata sections for thematic grouping
 * - Target chunk size: ~500 tokens with ~50 token overlap
 * - Each chunk carries section context (type, title, page range)
 */
/** Approximate token count (~3.5 chars per token for Romanian text) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
import type { GuideMetadata } from "../jobs/guideExtractorV3";

const TARGET_CHUNK_TOKENS = 500;
const MAX_CHUNK_TOKENS = 800;
const OVERLAP_TOKENS = 50;

export interface GuideChunk {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  pageStart: number | null;
  pageEnd: number | null;
  sectionType: string | null;
  sectionTitle: string | null;
}

/** Parse full guide text into page objects */
function parsePages(fullText: string): Array<{ page: number; text: string }> {
  const pageDelimiter = /--- Pagina (\d+) ---/g;
  const pageStarts: Array<{ page: number; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = pageDelimiter.exec(fullText)) !== null) {
    pageStarts.push({ page: parseInt(m[1], 10), start: m.index });
  }

  const pages: Array<{ page: number; text: string }> = [];
  for (let i = 0; i < pageStarts.length; i++) {
    const end = i + 1 < pageStarts.length ? pageStarts[i + 1].start : fullText.length;
    const rawText = fullText.slice(pageStarts[i].start, end);
    // Remove the delimiter line itself
    const contentStart = rawText.indexOf("\n") + 1;
    pages.push({ page: pageStarts[i].page, text: rawText.slice(contentStart).trim() });
  }

  // If no page delimiters found, treat entire text as one page
  if (pages.length === 0 && fullText.trim().length > 0) {
    pages.push({ page: 1, text: fullText.trim() });
  }

  return pages;
}

/** Assign each page to a metadata section */
function assignSections(
  pages: Array<{ page: number; text: string }>,
  metadata: GuideMetadata | null,
): Array<{ page: number; text: string; sectionType: string; sectionTitle: string }> {
  if (!metadata?.sectiuni?.length) {
    return pages.map(p => ({ ...p, sectionType: "general", sectionTitle: "Ghid complet" }));
  }

  return pages.map(p => {
    const section = metadata.sectiuni.find(
      s => p.page >= s.pagina_start && p.page <= s.pagina_end,
    );
    return {
      ...p,
      sectionType: section?.tip || "general",
      sectionTitle: section?.titlu || "Secțiune necunoscută",
    };
  });
}

/** Split pages into chunks respecting token limits and section boundaries */
export function chunkGuideText(
  fullText: string,
  metadata: GuideMetadata | null,
): GuideChunk[] {
  const pages = parsePages(fullText);
  const annotated = assignSections(pages, metadata);

  const chunks: GuideChunk[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;
  let currentPageStart: number | null = null;
  let currentPageEnd: number | null = null;
  let currentSectionType: string | null = null;
  let currentSectionTitle: string | null = null;

  function flushChunk() {
    if (currentChunk.length === 0) return;
    const content = currentChunk.join("\n\n");
    chunks.push({
      chunkIndex: chunks.length,
      content,
      tokenCount: estimateTokens(content),
      pageStart: currentPageStart,
      pageEnd: currentPageEnd,
      sectionType: currentSectionType,
      sectionTitle: currentSectionTitle,
    });
    // Overlap: keep last paragraph for context continuity
    const lastParagraph = currentChunk[currentChunk.length - 1];
    const lastTokens = estimateTokens(lastParagraph);
    if (lastTokens <= OVERLAP_TOKENS) {
      currentChunk = [lastParagraph];
      currentTokens = lastTokens;
    } else {
      currentChunk = [];
      currentTokens = 0;
    }
    currentPageStart = null;
    currentPageEnd = null;
  }

  for (const page of annotated) {
    // Section boundary → flush current chunk
    if (currentSectionType && currentSectionType !== page.sectionType && currentChunk.length > 0) {
      flushChunk();
    }

    currentSectionType = page.sectionType;
    currentSectionTitle = page.sectionTitle;

    // Split page text into paragraphs
    const paragraphs = page.text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    for (const para of paragraphs) {
      const paraTokens = estimateTokens(para);

      // If single paragraph exceeds max, split by sentences
      if (paraTokens > MAX_CHUNK_TOKENS) {
        if (currentChunk.length > 0) flushChunk();
        const sentences = para.split(/(?<=[.;:])\s+/);
        for (const sentence of sentences) {
          const sentTokens = estimateTokens(sentence);
          if (currentTokens + sentTokens > TARGET_CHUNK_TOKENS && currentChunk.length > 0) {
            if (currentPageStart === null) currentPageStart = page.page;
            currentPageEnd = page.page;
            flushChunk();
          }
          currentChunk.push(sentence);
          currentTokens += sentTokens;
          if (currentPageStart === null) currentPageStart = page.page;
          currentPageEnd = page.page;
        }
        continue;
      }

      // Would exceed target? Flush.
      if (currentTokens + paraTokens > TARGET_CHUNK_TOKENS && currentChunk.length > 0) {
        flushChunk();
      }

      currentChunk.push(para);
      currentTokens += paraTokens;
      if (currentPageStart === null) currentPageStart = page.page;
      currentPageEnd = page.page;
    }
  }

  // Flush remaining
  flushChunk();

  return chunks;
}
