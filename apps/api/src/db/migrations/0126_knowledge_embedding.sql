-- Add embedding column to solomon_knowledge for RAG retrieval
ALTER TABLE solomon_knowledge ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW index for fast semantic search
CREATE INDEX IF NOT EXISTS solomon_knowledge_embedding_idx ON solomon_knowledge
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index for org + enabled filter (used in retrieval WHERE clause)
CREATE INDEX IF NOT EXISTS solomon_knowledge_org_enabled_idx
  ON solomon_knowledge(organization_id, enabled)
  WHERE enabled = true;
