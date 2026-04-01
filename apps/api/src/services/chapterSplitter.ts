/**
 * Chapter splitter — splits document text into semantic chapters.
 *
 * Documents are split by headings/sections, preserving page boundaries.
 * Each chapter gets a title and content, stored in document_chapters table.
 * A brief (~800 words) summarizes the whole document.
 */
import { db } from "../db";
import { documentChapters, documentBriefs } from "../db/schema";
import { eq } from "drizzle-orm";
import { anthropic, withAILimit } from "../lib/anthropic";
import { logAIUsage } from "./aiUsage";

export interface Chapter {
  chapterIndex: number;
  title: string;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  tokenCount: number;
}

/** Approximate token count (~3.5 chars per token for Romanian text) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** Parse page delimiters from extracted text */
function parsePages(text: string): Array<{ page: number; text: string }> {
  const delimiter = /--- Pagina (\d+) ---/g;
  const starts: Array<{ page: number; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = delimiter.exec(text)) !== null) {
    starts.push({ page: parseInt(m[1], 10), start: m.index });
  }

  const pages: Array<{ page: number; text: string }> = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].start : text.length;
    const raw = text.slice(starts[i].start, end);
    const contentStart = raw.indexOf("\n") + 1;
    pages.push({ page: starts[i].page, text: raw.slice(contentStart).trim() });
  }

  if (pages.length === 0 && text.trim().length > 0) {
    pages.push({ page: 1, text: text.trim() });
  }
  return pages;
}

/**
 * Split document text into chapters based on heading patterns.
 * Handles Romanian document conventions (CAPITOLUL, Art., Secțiunea, etc.)
 */
export function splitIntoChapters(fullText: string): Chapter[] {
  const pages = parsePages(fullText);
  if (pages.length === 0) return [];

  // Common Romanian document heading patterns
  const headingPatterns = [
    /^(CAPITOLUL\s+[IVXLCDM\d]+[.:]?\s*.+)/im,
    /^(Cap(?:itolul)?\s*\.?\s*\d+[.:]?\s*.+)/im,
    /^(SECȚIUNEA\s+[IVXLCDM\d]+[.:]?\s*.+)/im,
    /^(Articolul\s+\d+[.:]?\s*.+)/im,
    /^(Art\.\s*\d+[.:]?\s*.+)/im,
    /^(\d+\.\s+[A-Z][A-ZĂÂÎȘȚ\s]{5,})/m,
    /^(\d+\.\d+\.?\s+[A-Z].{10,})/m,
    /^([A-Z][A-ZĂÂÎȘȚ\s]{10,})$/m, // ALL CAPS lines (likely headings)
  ];

  // Build flat text with page tracking
  const lines: Array<{ text: string; page: number }> = [];
  for (const p of pages) {
    for (const line of p.text.split("\n")) {
      lines.push({ text: line, page: p.page });
    }
  }

  // Find heading positions
  const headings: Array<{ lineIdx: number; title: string; page: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].text.trim();
    if (line.length < 5 || line.length > 200) continue;

    for (const pattern of headingPatterns) {
      if (pattern.test(line)) {
        headings.push({ lineIdx: i, title: line.replace(/\s+/g, " ").trim(), page: lines[i].page });
        break;
      }
    }
  }

  // If no headings found, split by pages (max ~2000 tokens per chapter)
  if (headings.length === 0) {
    return splitByPageGroups(pages);
  }

  // Build chapters from heading boundaries
  const chapters: Chapter[] = [];
  for (let h = 0; h < headings.length; h++) {
    const start = headings[h].lineIdx;
    const end = h + 1 < headings.length ? headings[h + 1].lineIdx : lines.length;

    const chapterLines = lines.slice(start, end);
    const content = chapterLines.map(l => l.text).join("\n").trim();
    if (content.length < 20) continue;

    const pageStart = chapterLines[0]?.page ?? null;
    const pageEnd = chapterLines[chapterLines.length - 1]?.page ?? pageStart;

    chapters.push({
      chapterIndex: chapters.length,
      title: headings[h].title.slice(0, 500),
      content,
      pageStart,
      pageEnd,
      tokenCount: estimateTokens(content),
    });
  }

  // Include content before first heading as "Introducere"
  if (headings.length > 0 && headings[0].lineIdx > 0) {
    const preContent = lines.slice(0, headings[0].lineIdx).map(l => l.text).join("\n").trim();
    if (preContent.length > 50) {
      chapters.unshift({
        chapterIndex: 0,
        title: "Introducere",
        content: preContent,
        pageStart: lines[0]?.page ?? null,
        pageEnd: lines[headings[0].lineIdx - 1]?.page ?? null,
        tokenCount: estimateTokens(preContent),
      });
      // Re-index
      for (let i = 1; i < chapters.length; i++) {
        chapters[i].chapterIndex = i;
      }
    }
  }

  return chapters;
}

/** Fallback: split by page groups when no headings detected */
function splitByPageGroups(pages: Array<{ page: number; text: string }>): Chapter[] {
  const TARGET_TOKENS = 1500;
  const chapters: Chapter[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  let pageStart = pages[0]?.page ?? 1;

  for (const p of pages) {
    const tokens = estimateTokens(p.text);
    if (currentTokens + tokens > TARGET_TOKENS && current.length > 0) {
      const content = current.join("\n\n");
      chapters.push({
        chapterIndex: chapters.length,
        title: `Secțiunea ${chapters.length + 1} (pag. ${pageStart}-${p.page - 1})`,
        content,
        pageStart,
        pageEnd: p.page - 1,
        tokenCount: estimateTokens(content),
      });
      current = [];
      currentTokens = 0;
      pageStart = p.page;
    }
    current.push(p.text);
    currentTokens += tokens;
  }

  if (current.length > 0) {
    const content = current.join("\n\n");
    chapters.push({
      chapterIndex: chapters.length,
      title: `Secțiunea ${chapters.length + 1} (pag. ${pageStart}-${pages[pages.length - 1]?.page ?? pageStart})`,
      content,
      pageStart,
      pageEnd: pages[pages.length - 1]?.page ?? pageStart,
      tokenCount: estimateTokens(content),
    });
  }

  return chapters;
}

/**
 * Generate a document brief (~800 words) using Sonnet.
 */
export async function generateBrief(
  documentName: string,
  chapters: Chapter[],
  organizationId: string,
): Promise<string> {
  if (chapters.length === 0) return "";

  const chapterSummaries = chapters
    .map(ch => `## ${ch.title}\n${ch.content.slice(0, 800)}`)
    .join("\n\n---\n\n");

  const response: any = await withAILimit(async () => {
    return anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: `Ești un expert în fonduri europene. Generezi rezumate structurate ale documentelor de finanțare.
Rezumatul trebuie să fie în limba română, ~800 cuvinte, și să acopere:
1. Scopul și obiectivele documentului
2. Condițiile de eligibilitate principale (dacă e un ghid)
3. Criteriile de selecție și punctajele (dacă există)
4. Cheltuielile eligibile și plafoanele
5. Termenele și procedurile importante
6. Orice altceva critic pentru un consultant de fonduri

Scrie DOAR rezumatul, fără preambul sau explicații.`,
      messages: [{
        role: "user",
        content: `Generează un rezumat al documentului "${documentName}":\n\n${chapterSummaries.slice(0, 50000)}`,
      }],
    });
  }, "batch");

  const textBlock = (response as any).content?.find((b: any) => b.type === "text");
  const brief = textBlock?.text || "";

  await logAIUsage({
    organizationId,
    agent: "solomon",
    model: "claude-sonnet-4-6",
    tokensInput: (response as any).usage?.input_tokens || 0,
    tokensOutput: (response as any).usage?.output_tokens || 0,
    action: "generate_brief",
  });

  return brief;
}

/**
 * Process a document: split into chapters, generate brief, save to DB.
 */
export async function processDocumentChapters(params: {
  documentId: string;
  organizationId: string;
  documentName: string;
  fullText: string;
}): Promise<{ chapterCount: number; briefLength: number }> {
  const { documentId, organizationId, documentName, fullText } = params;

  // Split into chapters
  const chapters = splitIntoChapters(fullText);
  if (chapters.length === 0) {
    return { chapterCount: 0, briefLength: 0 };
  }

  // Delete existing chapters for this document (re-upload)
  await db.delete(documentChapters).where(eq(documentChapters.documentId, documentId));

  // Insert chapters in batches
  const rows = chapters.map(ch => ({
    documentId,
    organizationId,
    chapterIndex: ch.chapterIndex,
    title: ch.title,
    content: ch.content,
    pageStart: ch.pageStart,
    pageEnd: ch.pageEnd,
    tokenCount: ch.tokenCount,
    metadata: {},
  }));

  for (let i = 0; i < rows.length; i += 50) {
    await db.insert(documentChapters).values(rows.slice(i, i + 50));
  }

  // Generate brief
  let brief = "";
  try {
    brief = await generateBrief(documentName, chapters, organizationId);
  } catch (err) {
    console.warn(`[chapters] Brief generation failed for ${documentId}:`, (err as Error).message);
  }

  if (brief) {
    // Upsert brief
    const existing = await db.query.documentBriefs.findFirst({
      where: eq(documentBriefs.documentId, documentId),
    });

    const totalTokens = chapters.reduce((sum, ch) => sum + ch.tokenCount, 0);

    if (existing) {
      await db.update(documentBriefs).set({
        brief,
        chapterCount: chapters.length,
        totalTokens,
      }).where(eq(documentBriefs.id, existing.id));
    } else {
      await db.insert(documentBriefs).values({
        documentId,
        organizationId,
        brief,
        chapterCount: chapters.length,
        totalTokens,
      });
    }
  }

  console.log(`[chapters] Processed ${documentName}: ${chapters.length} chapters, brief ${brief.length} chars`);
  return { chapterCount: chapters.length, briefLength: brief.length };
}
