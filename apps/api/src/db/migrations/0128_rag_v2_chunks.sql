-- RAG v2: Unified chunks table with Voyage embeddings (1024 dims)
-- Sprint 1 — pgvector + tsvector + hybrid search indexes

-- Ensure pgvector extension exists (already created by 0125)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create chunks table
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id UUID,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,  -- 'session' | 'knowledge_base'
  content TEXT NOT NULL,
  embedding vector(1024),     -- voyage-context-3
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- tsvector GENERATED column for full-text search (Romanian)
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('romanian', content)) STORED;

-- HNSW index for vector similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_chunks_tsv
  ON chunks USING gin (content_tsv);

-- Filtering indexes
CREATE INDEX IF NOT EXISTS chunks_cabinet_source_idx
  ON chunks (cabinet_id, source_type);

CREATE INDEX IF NOT EXISTS chunks_session_idx
  ON chunks (session_id) WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS chunks_document_idx
  ON chunks (document_id);

-- GIN index on metadata JSONB for layer/topic filtering
CREATE INDEX IF NOT EXISTS idx_chunks_metadata
  ON chunks USING gin (metadata);
