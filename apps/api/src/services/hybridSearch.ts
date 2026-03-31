/**
 * BM25 Keyword Search on chunks table (PostgreSQL tsvector).
 *
 * No vector embeddings needed — uses full-text search with Romanian dictionary.
 * Solomon searches by keywords, the DB ranks by relevance.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

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

  // Build dynamic WHERE filters
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

  // BM25 keyword search using PostgreSQL tsvector (GENERATED column on chunks)
  // No vector embeddings needed — Solomon searches by keywords in Romanian
  const results = await db.execute(sql`
    SELECT id, content, metadata,
      ts_rank(content_tsv, plainto_tsquery('romanian', ${query})) as rank_score
    FROM chunks
    WHERE ${filterSql}
      AND content_tsv @@ plainto_tsquery('romanian', ${query})
    ORDER BY rank_score DESC
    LIMIT ${topK}
  `);

  const rows = (results as any).rows || results;

  return (rows as any[]).map(row => ({
    id: row.id,
    content: row.content,
    metadata: typeof row.metadata === "string" ? (() => { try { return JSON.parse(row.metadata); } catch { return {}; } })() : (row.metadata || {}),
    score: parseFloat(row.rank_score || "0"),
    matchType: "keyword" as const,
  }));
}
