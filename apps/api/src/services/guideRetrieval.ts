/**
 * RAG retrieval service — searches both guide_chunks AND solomon_knowledge.
 *
 * Embeds the user query → searches pgvector for top-K similar results
 * → returns ranked excerpts for Solomon context.
 */
import { db } from "../db";
import { guideChunks, solomonKnowledge } from "../db/schema";
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
  source: "guide" | "knowledge";
}

/**
 * Retrieve the most relevant guide chunks for a query.
 */
export async function retrieveGuideChunks(
  query: string,
  organizationId: string,
  options?: {
    topK?: number;
    documentId?: string;
    sectionTypes?: string[];
    minSimilarity?: number;
  },
): Promise<RetrievedChunk[]> {
  const topK = Math.min(options?.topK || DEFAULT_TOP_K, MAX_TOP_K);
  const minSimilarity = options?.minSimilarity ?? 0.3;

  const queryEmbedding = await embedText(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

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
      source: "guide" as const,
    }));
}

/**
 * Retrieve the most relevant knowledge entries for a query.
 */
export async function retrieveKnowledgeEntries(
  query: string,
  organizationId: string,
  options?: {
    topK?: number;
    minSimilarity?: number;
  },
): Promise<RetrievedChunk[]> {
  const topK = Math.min(options?.topK || 5, MAX_TOP_K);
  const minSimilarity = options?.minSimilarity ?? 0.3;

  const queryEmbedding = await embedText(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const now = new Date().toISOString();
  const results = await db.execute(sql`
    SELECT
      id,
      title,
      content,
      category,
      source_reference,
      1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM solomon_knowledge
    WHERE organization_id = ${organizationId}
      AND enabled = true
      AND embedding IS NOT NULL
      AND (valid_from IS NULL OR valid_from <= ${now}::timestamp)
      AND (valid_until IS NULL OR valid_until >= ${now}::timestamp)
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${topK}
  `);

  const rows = (results as any).rows || results;

  return rows
    .filter((r: any) => r.similarity >= minSimilarity)
    .map((r: any) => ({
      id: r.id,
      content: r.content,
      tokenCount: Math.ceil((r.content?.length || 0) / 3.5),
      pageStart: null,
      pageEnd: null,
      sectionType: r.category,
      sectionTitle: r.title,
      similarity: parseFloat(r.similarity),
      documentId: "",
      source: "knowledge" as const,
    }));
}

/**
 * Combined retrieval: guide chunks + knowledge entries.
 * Merges, sorts by similarity, and formats for LLM prompt.
 */
export async function retrieveContext(
  query: string,
  organizationId: string,
  options?: {
    guideTopK?: number;
    knowledgeTopK?: number;
    documentId?: string;
    maxTokens?: number;
  },
): Promise<{ context: string; guideContext: string; knowledgeContext: string; chunks: RetrievedChunk[]; totalTokens: number }> {
  const maxTokens = options?.maxTokens || 4000;
  const guideTokenBudget = Math.round(maxTokens * 0.65);
  const knowledgeTokenBudget = Math.round(maxTokens * 0.35);

  // Run both searches in parallel (single embedding call reused)
  const queryEmbedding = await embedText(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const [guideResults, knowledgeResults] = await Promise.all([
    db.execute(sql`
      SELECT
        id, content, token_count, page_start, page_end,
        section_type, section_title, document_id,
        1 - (embedding <=> ${embeddingStr}::vector) as similarity
      FROM guide_chunks
      WHERE organization_id = ${organizationId}
        ${options?.documentId ? sql`AND document_id = ${options.documentId}` : sql``}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${options?.guideTopK || 8}
    `),
    db.execute(sql`
      SELECT
        id, title, content, category, source_reference,
        1 - (embedding <=> ${embeddingStr}::vector) as similarity
      FROM solomon_knowledge
      WHERE organization_id = ${organizationId}
        AND enabled = true
        AND embedding IS NOT NULL
        AND (valid_from IS NULL OR valid_from <= now())
        AND (valid_until IS NULL OR valid_until >= now())
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${options?.knowledgeTopK || 5}
    `),
  ]);

  const guideRows = ((guideResults as any).rows || guideResults)
    .filter((r: any) => parseFloat(r.similarity) >= 0.3);
  const knowledgeRows = ((knowledgeResults as any).rows || knowledgeResults)
    .filter((r: any) => parseFloat(r.similarity) >= 0.3);

  // Format guide context
  let guideParts: string[] = [];
  let guideTokens = 0;
  const bySection = new Map<string, any[]>();
  for (const r of guideRows) {
    const key = r.section_type || "general";
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)!.push(r);
  }
  for (const [, sectionRows] of bySection) {
    sectionRows.sort((a: any, b: any) => (a.page_start || 0) - (b.page_start || 0));
    const title = sectionRows[0]?.section_title || "Ghid";
    guideParts.push(`--- ${title.toUpperCase()} ---`);
    for (const r of sectionRows) {
      const tokens = r.token_count || Math.ceil((r.content?.length || 0) / 3.5);
      if (guideTokens + tokens > guideTokenBudget) break;
      const pageRef = r.page_start
        ? r.page_end && r.page_end !== r.page_start ? `[p${r.page_start}-${r.page_end}]` : `[p${r.page_start}]`
        : "";
      guideParts.push(`${pageRef} ${r.content}`);
      guideTokens += tokens;
    }
  }

  // Format knowledge context
  let knowledgeParts: string[] = [];
  let knowledgeTokens = 0;
  for (const r of knowledgeRows) {
    const tokens = Math.ceil((r.content?.length || 0) / 3.5);
    if (knowledgeTokens + tokens > knowledgeTokenBudget) break;
    const source = r.source_reference ? ` (${r.source_reference})` : "";
    knowledgeParts.push(`### ${r.title}${source}\n${r.content}`);
    knowledgeTokens += tokens;
  }

  const guideContext = guideParts.join("\n\n");
  const knowledgeContext = knowledgeParts.join("\n\n");

  // Combined context
  const contextParts: string[] = [];
  if (guideContext) contextParts.push(guideContext);
  if (knowledgeContext) contextParts.push(`--- BAZĂ DE CUNOȘTINȚE ---\n\n${knowledgeContext}`);

  // Build unified chunks list
  const allChunks: RetrievedChunk[] = [
    ...guideRows.map((r: any) => ({
      id: r.id, content: r.content, tokenCount: r.token_count || 0,
      pageStart: r.page_start, pageEnd: r.page_end,
      sectionType: r.section_type, sectionTitle: r.section_title,
      similarity: parseFloat(r.similarity), documentId: r.document_id,
      source: "guide" as const,
    })),
    ...knowledgeRows.map((r: any) => ({
      id: r.id, content: r.content, tokenCount: Math.ceil((r.content?.length || 0) / 3.5),
      pageStart: null, pageEnd: null,
      sectionType: r.category, sectionTitle: r.title,
      similarity: parseFloat(r.similarity), documentId: "",
      source: "knowledge" as const,
    })),
  ];

  return {
    context: contextParts.join("\n\n"),
    guideContext,
    knowledgeContext,
    chunks: allChunks,
    totalTokens: guideTokens + knowledgeTokens,
  };
}

/**
 * Check if an organization has any RAG content indexed.
 */
export async function hasRAGContent(organizationId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS(
      SELECT 1 FROM guide_chunks WHERE organization_id = ${organizationId} AND embedding IS NOT NULL
      UNION ALL
      SELECT 1 FROM solomon_knowledge WHERE organization_id = ${organizationId} AND enabled = true AND embedding IS NOT NULL
    ) as has_content
  `);
  const rows = (result as any).rows || result;
  return rows[0]?.has_content === true;
}

// Keep backward-compat exports
export const hasGuideChunks = hasRAGContent;

export async function retrieveGuideContext(
  query: string,
  organizationId: string,
  options?: { topK?: number; documentId?: string; maxTokens?: number },
): Promise<{ context: string; chunks: RetrievedChunk[]; totalTokens: number }> {
  const result = await retrieveContext(query, organizationId, {
    guideTopK: options?.topK || 8,
    knowledgeTopK: 5,
    documentId: options?.documentId,
    maxTokens: options?.maxTokens || 4000,
  });
  return { context: result.context, chunks: result.chunks, totalTokens: result.totalTokens };
}
