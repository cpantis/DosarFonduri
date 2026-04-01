/**
 * Chapter search — full-text search on document_chapters using PostgreSQL tsvector.
 *
 * Romanian stemmer for natural language queries.
 * No vector embeddings — pure keyword matching with BM25 ranking.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

export interface ChapterSearchOptions {
  query: string;
  organizationId: string;
  documentId?: string;     // search within a specific document
  folderId?: string;       // search within a session folder's documents
  topK?: number;           // default 8
}

export interface ChapterSearchResult {
  id: string;
  documentId: string;
  documentName: string;
  chapterIndex: number;
  title: string;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  score: number;
}

/**
 * Search document chapters using PostgreSQL full-text search with Romanian stemmer.
 */
export async function searchChapters(options: ChapterSearchOptions): Promise<ChapterSearchResult[]> {
  const { query, organizationId, documentId, folderId, topK = 8 } = options;

  if (!query.trim()) return [];

  // Build WHERE clause dynamically
  let filterSql = sql`dc.organization_id = ${organizationId}`;
  if (documentId) {
    filterSql = sql`${filterSql} AND dc.document_id = ${documentId}`;
  }
  if (folderId) {
    filterSql = sql`${filterSql} AND d.folder_id = ${folderId}`;
  }

  const results = await db.execute(sql`
    SELECT
      dc.id,
      dc.document_id,
      d.name as document_name,
      dc.chapter_index,
      dc.title,
      dc.content,
      dc.page_start,
      dc.page_end,
      ts_rank(dc.content_tsv, plainto_tsquery('romanian', ${query})) as rank_score
    FROM document_chapters dc
    JOIN documents d ON d.id = dc.document_id
    WHERE ${filterSql}
      AND dc.content_tsv @@ plainto_tsquery('romanian', ${query})
    ORDER BY rank_score DESC
    LIMIT ${topK}
  `);

  const rows = (results as any).rows || results;

  return (rows as any[]).map(row => ({
    id: row.id,
    documentId: row.document_id,
    documentName: row.document_name,
    chapterIndex: row.chapter_index,
    title: row.title,
    content: row.content,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    score: parseFloat(row.rank_score || "0"),
  }));
}

/**
 * Get the brief for a document (if available).
 */
export async function getDocumentBrief(documentId: string): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT brief FROM document_briefs WHERE document_id = ${documentId} LIMIT 1
  `);
  const rows = (result as any).rows || result;
  return rows[0]?.brief || null;
}

/**
 * Get all briefs for documents in a folder (session overview).
 */
export async function getSessionBriefs(folderId: string, organizationId: string): Promise<Array<{
  documentId: string;
  documentName: string;
  brief: string;
  chapterCount: number;
}>> {
  const results = await db.execute(sql`
    SELECT
      db.document_id,
      d.name as document_name,
      db.brief,
      db.chapter_count
    FROM document_briefs db
    JOIN documents d ON d.id = db.document_id
    WHERE d.folder_id = ${folderId}
      AND d.organization_id = ${organizationId}
    ORDER BY d.name
  `);

  const rows = (results as any).rows || results;
  return (rows as any[]).map(row => ({
    documentId: row.document_id,
    documentName: row.document_name,
    brief: row.brief,
    chapterCount: row.chapter_count,
  }));
}
