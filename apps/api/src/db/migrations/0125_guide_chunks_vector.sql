-- Enable pgvector extension for embedding storage
CREATE EXTENSION IF NOT EXISTS vector;

-- Guide chunks table: stores chunked guide text with embeddings for RAG retrieval
CREATE TABLE IF NOT EXISTS guide_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  page_start INTEGER,
  page_end INTEGER,
  section_type VARCHAR(50),
  section_title VARCHAR(500),
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for efficient retrieval
CREATE INDEX IF NOT EXISTS guide_chunks_doc_idx ON guide_chunks(document_id);
CREATE INDEX IF NOT EXISTS guide_chunks_org_idx ON guide_chunks(organization_id);
CREATE INDEX IF NOT EXISTS guide_chunks_section_idx ON guide_chunks(section_type);

-- HNSW index for fast approximate nearest neighbor search
-- Using cosine distance (most common for text embeddings)
CREATE INDEX IF NOT EXISTS guide_chunks_embedding_idx ON guide_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
