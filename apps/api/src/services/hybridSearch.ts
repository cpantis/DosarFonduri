/**
 * Full-text search on document_chapters using PostgreSQL tsvector.
 *
 * Romanian stemmer for natural language queries.
 * No vector embeddings — pure keyword matching with BM25 ranking.
 *
 * Also searches legacy guideChunks table (for backward compatibility with
 * guides processed before the chapter system).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

export interface HybridSearchOptions {
  query: string;
  cabinetId: string;
  sessionId?: string;
  sourceType?: "session" | "knowledge_base";
  layers?: string[];
  topK?: number;
}

export interface HybridSearchResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
  matchType: "keyword";
}

export async function hybridSearch(options: HybridSearchOptions): Promise<HybridSearchResult[]> {
  const { query, cabinetId, sessionId, topK = 5 } = options;

  if (!query.trim()) return [];

  // Search document_chapters (primary table)
  let results: any[] = [];
  try {
    const chapterResults = await db.execute(sql`
      SELECT dc.id, dc.content, dc.metadata,
        ts_rank(dc.content_tsv, plainto_tsquery('romanian', ${query})) as rank_score
      FROM document_chapters dc
      WHERE dc.organization_id = ${cabinetId}
        AND dc.content_tsv @@ plainto_tsquery('romanian', ${query})
      ORDER BY rank_score DESC
      LIMIT ${topK}
    `);
    results = (chapterResults as any).rows || chapterResults as any[];
  } catch (err) {
    // document_chapters table may not exist yet (migration pending)
    console.warn("[hybridSearch] document_chapters search failed:", (err as Error).message?.slice(0, 100));
  }

  // Fallback: also search guideChunks (legacy guides, no vector needed)
  if (results.length < topK) {
    try {
      const guideResults = await db.execute(sql`
        SELECT id, content, metadata,
          ts_rank(to_tsvector('romanian', content), plainto_tsquery('romanian', ${query})) as rank_score
        FROM guide_chunks
        WHERE organization_id = ${cabinetId}
          AND to_tsvector('romanian', content) @@ plainto_tsquery('romanian', ${query})
        ORDER BY rank_score DESC
        LIMIT ${topK - results.length}
      `);
      const guideRows = (guideResults as any).rows || guideResults as any[];
      results = [...results, ...guideRows];
    } catch {
      // guide_chunks table may not exist or have different schema
    }
  }

  return results.map((row: any) => ({
    id: row.id,
    content: row.content,
    metadata: typeof row.metadata === "string"
      ? (() => { try { return JSON.parse(row.metadata); } catch { return {}; } })()
      : (row.metadata || {}),
    score: parseFloat(row.rank_score || "0"),
    matchType: "keyword" as const,
  }));
}
