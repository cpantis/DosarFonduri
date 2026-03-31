/**
 * Hybrid Search — Vector cosine + BM25 keyword + RRF Fusion
 * Operates on the RAG v2 `chunks` table (pgvector + tsvector).
 *
 * Uses parameterized queries via drizzle sql`` tagged template
 * (same pattern as guideRetrieval.ts).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { embedQuery } from "./voyageEmbeddings";

export interface HybridSearchOptions {
  query: string;
  cabinetId: string;
  sessionId?: string;
  sourceType?: "session" | "knowledge_base";
  layers?: string[];           // filter on metadata->>'layer'
  topK?: number;               // default 5
}

export interface HybridSearchResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
  matchType: "vector" | "keyword" | "both";
}

const RRF_K = 60; // Reciprocal Rank Fusion constant
const CANDIDATE_POOL = 20; // candidates per search leg

export async function hybridSearch(options: HybridSearchOptions): Promise<HybridSearchResult[]> {
  const { query, cabinetId, sessionId, sourceType, layers, topK = 5 } = options;

  // 1. Embed the query
  const queryEmbedding = await embedQuery(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // 2. Build dynamic WHERE filters as SQL fragments
  // Base filter: always filter by cabinet
  let filterSql = sql`cabinet_id = ${cabinetId}`;

  if (sourceType) {
    filterSql = sql`${filterSql} AND source_type = ${sourceType}`;
  }
  if (sessionId) {
    filterSql = sql`${filterSql} AND session_id = ${sessionId}`;
  }
  if (layers && layers.length > 0) {
    filterSql = sql`${filterSql} AND metadata->>'layer' = ANY(${layers}::text[])`;
  }

  // 3. Hybrid search with RRF fusion — single SQL query
  //    Uses the same parameterized pattern as guideRetrieval.ts
  const results = await db.execute(sql`
    WITH vector_search AS (
      SELECT id, content, metadata,
        ROW_NUMBER() OVER (ORDER BY embedding <=> ${embeddingStr}::vector) as rank_v
      FROM chunks
      WHERE ${filterSql} AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${CANDIDATE_POOL}
    ),
    keyword_search AS (
      SELECT id, content, metadata,
        ROW_NUMBER() OVER (ORDER BY ts_rank(content_tsv, plainto_tsquery('romanian', ${query})) DESC) as rank_k
      FROM chunks
      WHERE ${filterSql} AND content_tsv @@ plainto_tsquery('romanian', ${query})
      ORDER BY ts_rank(content_tsv, plainto_tsquery('romanian', ${query})) DESC
      LIMIT ${CANDIDATE_POOL}
    )
    SELECT
      COALESCE(v.id, k.id) as id,
      COALESCE(v.content, k.content) as content,
      COALESCE(v.metadata, k.metadata) as metadata,
      (COALESCE(1.0 / (${RRF_K} + v.rank_v), 0) + COALESCE(1.0 / (${RRF_K} + k.rank_k), 0)) as rrf_score,
      CASE
        WHEN v.id IS NOT NULL AND k.id IS NOT NULL THEN 'both'
        WHEN v.id IS NOT NULL THEN 'vector'
        ELSE 'keyword'
      END as match_type
    FROM vector_search v
    FULL OUTER JOIN keyword_search k ON v.id = k.id
    ORDER BY rrf_score DESC
    LIMIT ${topK}
  `);

  const rows = (results as any).rows || results;

  return (rows as any[]).map(row => ({
    id: row.id,
    content: row.content,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
    score: parseFloat(row.rrf_score),
    matchType: row.match_type,
  }));
}
