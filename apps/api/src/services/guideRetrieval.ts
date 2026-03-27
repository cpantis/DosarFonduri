/**
 * Guide RAG retrieval service.
 *
 * Embeds the user query → searches pgvector for top-K similar chunks
 * → returns ranked guide excerpts for Solomon context.
 */
import { db } from "../db";
import { guideChunks } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { embedText } from "./embeddings";

const DEFAULT_TOP_K = 8;
const MAX_TOP_K = 20;

export interface RetrievedChunk {
  id: string;
  content: string;
  tokenCount: number;
  pageStart: number | null;
  pageEnd: number | null;
  sectionType: string | null;
  sectionTitle: string | null;
  similarity: number;
  documentId: string;
}

/**
 * Retrieve the most relevant guide chunks for a query.
 *
 * Uses cosine similarity via pgvector's <=> operator.
 * Returns up to topK chunks, ordered by similarity.
 */
export async function retrieveGuideChunks(
  query: string,
  organizationId: string,
  options?: {
    topK?: number;
    documentId?: string;       // Filter to specific guide
    sectionTypes?: string[];   // Filter by section types
    minSimilarity?: number;    // Minimum similarity threshold (0-1)
  },
): Promise<RetrievedChunk[]> {
  const topK = Math.min(options?.topK || DEFAULT_TOP_K, MAX_TOP_K);
  const minSimilarity = options?.minSimilarity ?? 0.3;

  // Embed the query
  const queryEmbedding = await embedText(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // Build WHERE conditions
  const conditions = [eq(guideChunks.organizationId, organizationId)];
  if (options?.documentId) {
    conditions.push(eq(guideChunks.documentId, options.documentId));
  }
  if (options?.sectionTypes?.length) {
    conditions.push(
      sql`${guideChunks.sectionType} = ANY(${options.sectionTypes})`,
    );
  }

  // Query with cosine distance (1 - cosine_distance = similarity)
  const results = await db.execute(sql`
    SELECT
      id,
      content,
      token_count,
      page_start,
      page_end,
      section_type,
      section_title,
      document_id,
      1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM guide_chunks
    WHERE organization_id = ${organizationId}
      ${options?.documentId ? sql`AND document_id = ${options.documentId}` : sql``}
      ${options?.sectionTypes?.length ? sql`AND section_type = ANY(${options.sectionTypes}::text[])` : sql``}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${topK}
  `);

  const rows = (results as any).rows || results;

  return rows
    .filter((r: any) => r.similarity >= minSimilarity)
    .map((r: any) => ({
      id: r.id,
      content: r.content,
      tokenCount: r.token_count,
      pageStart: r.page_start,
      pageEnd: r.page_end,
      sectionType: r.section_type,
      sectionTitle: r.section_title,
      similarity: parseFloat(r.similarity),
      documentId: r.document_id,
    }));
}

/**
 * Retrieve guide chunks and format them for inclusion in an LLM prompt.
 *
 * Groups chunks by section, deduplicates overlapping content,
 * and formats with page references.
 */
export async function retrieveGuideContext(
  query: string,
  organizationId: string,
  options?: {
    topK?: number;
    documentId?: string;
    maxTokens?: number;
  },
): Promise<{ context: string; chunks: RetrievedChunk[]; totalTokens: number }> {
  const maxTokens = options?.maxTokens || 4000;

  const chunks = await retrieveGuideChunks(query, organizationId, {
    topK: options?.topK || 10,
    documentId: options?.documentId,
  });

  if (chunks.length === 0) {
    return { context: "", chunks: [], totalTokens: 0 };
  }

  // Group by section for coherent presentation
  const bySection = new Map<string, RetrievedChunk[]>();
  for (const chunk of chunks) {
    const key = chunk.sectionType || "general";
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)!.push(chunk);
  }

  // Build formatted context (respect token budget)
  const parts: string[] = [];
  let totalTokens = 0;

  for (const [section, sectionChunks] of bySection) {
    // Sort by page within each section
    sectionChunks.sort((a, b) => (a.pageStart || 0) - (b.pageStart || 0));

    const sectionTitle = sectionChunks[0]?.sectionTitle || section;
    parts.push(`\n--- ${sectionTitle.toUpperCase()} ---`);

    for (const chunk of sectionChunks) {
      if (totalTokens + chunk.tokenCount > maxTokens) break;

      const pageRef = chunk.pageStart
        ? chunk.pageEnd && chunk.pageEnd !== chunk.pageStart
          ? `[p${chunk.pageStart}-${chunk.pageEnd}]`
          : `[p${chunk.pageStart}]`
        : "";

      parts.push(`${pageRef} ${chunk.content}`);
      totalTokens += chunk.tokenCount;
    }
  }

  return {
    context: parts.join("\n\n"),
    chunks,
    totalTokens,
  };
}

/**
 * Check if an organization has guide chunks indexed.
 */
export async function hasGuideChunks(organizationId: string): Promise<boolean> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(guideChunks)
    .where(eq(guideChunks.organizationId, organizationId));
  return (result[0]?.count || 0) > 0;
}
