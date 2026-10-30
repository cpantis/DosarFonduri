/**
 * Full-text search on document_chapters using PostgreSQL tsvector.
 *
 * Romanian stemmer for natural language queries.
 * No vector embeddings — pure keyword matching with BM25 ranking.
 *
 * Also searches legacy guideChunks table (for backward compatibility with
 * guides processed before the chapter system).
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";

/**
 * SQL predicate restricting `<docAlias>.folder_id` to the folders a project session may read:
 * the session folder and all its descendants (e.g. "ghiduri", "templateuri" subfolders),
 * plus the cabinet knowledge base ("referinte" folders and their descendants).
 * Guides from other programs/sessions of the same cabinet are excluded.
 */
export function sessionScopeFilter(docFolderColumn: SQL, sessionFolderId: string, organizationId: string): SQL {
  return sql`${docFolderColumn} IN (
    WITH RECURSIVE scope(id) AS (
      SELECT id FROM document_folders
      WHERE organization_id = ${organizationId}
        AND (id = ${sessionFolderId} OR type = 'referinte')
      UNION
      SELECT f.id FROM document_folders f JOIN scope s ON f.parent_id = s.id
    )
    SELECT id FROM scope
  )`;
}

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

  // Without a session, search the whole cabinet (knowledge-base style lookups)
  const scope = sessionId ? sessionScopeFilter(sql`d.folder_id`, sessionId, cabinetId) : sql`TRUE`;

  // Search document_chapters (primary table)
  let results: any[] = [];
  try {
    const chapterResults = await db.execute(sql`
      SELECT dc.id, dc.content, dc.metadata,
        ts_rank(dc.content_tsv, plainto_tsquery('romanian', ${query})) as rank_score
      FROM document_chapters dc
      JOIN documents d ON d.id = dc.document_id
      WHERE dc.organization_id = ${cabinetId}
        AND ${scope}
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
        SELECT gc.id, gc.content, gc.metadata,
          ts_rank(to_tsvector('romanian', gc.content), plainto_tsquery('romanian', ${query})) as rank_score
        FROM guide_chunks gc
        JOIN documents d ON d.id = gc.document_id
        WHERE gc.organization_id = ${cabinetId}
          AND ${scope}
          AND to_tsvector('romanian', gc.content) @@ plainto_tsquery('romanian', ${query})
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
