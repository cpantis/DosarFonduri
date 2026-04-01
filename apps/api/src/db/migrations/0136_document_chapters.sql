-- Document chapters: chapter-based document understanding
-- Each document is split into chapters (sections/headings) for structured search

CREATE TABLE IF NOT EXISTS "document_chapters" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" UUID NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "chapter_index" INTEGER NOT NULL,
  "title" VARCHAR(500) NOT NULL,
  "content" TEXT NOT NULL,
  "page_start" INTEGER,
  "page_end" INTEGER,
  "token_count" INTEGER NOT NULL DEFAULT 0,
  "content_tsv" TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('romanian', coalesce("title", '') || ' ' || "content")
  ) STORED,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "doc_chapters_doc_idx" ON "document_chapters"("document_id");
CREATE INDEX IF NOT EXISTS "doc_chapters_org_idx" ON "document_chapters"("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "doc_chapters_doc_chapter_idx" ON "document_chapters"("document_id", "chapter_index");
CREATE INDEX IF NOT EXISTS "doc_chapters_tsv_idx" ON "document_chapters" USING GIN("content_tsv");

-- Document briefs: AI-generated summary per document (~800 words)
CREATE TABLE IF NOT EXISTS "document_briefs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" UUID NOT NULL UNIQUE REFERENCES "documents"("id") ON DELETE CASCADE,
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "brief" TEXT NOT NULL,
  "chapter_count" INTEGER NOT NULL DEFAULT 0,
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "model" VARCHAR(100) NOT NULL DEFAULT 'claude-sonnet-4-6',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "doc_briefs_doc_idx" ON "document_briefs"("document_id");
CREATE INDEX IF NOT EXISTS "doc_briefs_org_idx" ON "document_briefs"("organization_id");
