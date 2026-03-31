-- RAG v2 Sprint 2: Add classification JSONB to documents table
-- Stores AI classification result (docType, routingAction, confidence, etc.)

ALTER TABLE documents ADD COLUMN IF NOT EXISTS classification JSONB;

-- Index for querying documents by classification docType and routingAction
CREATE INDEX IF NOT EXISTS idx_documents_classification_doc_type
  ON documents ((classification->>'docType')) WHERE classification IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_classification_routing
  ON documents ((classification->>'routingAction')) WHERE classification IS NOT NULL;
