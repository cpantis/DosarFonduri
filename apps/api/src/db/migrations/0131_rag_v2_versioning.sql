-- RAG v2 Sprint 4: Document versioning fields
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_version INTEGER DEFAULT 1;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS superseded_by UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS supersedes UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN DEFAULT true;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS version_diff JSONB;

-- Index for querying current versions per folder
CREATE INDEX IF NOT EXISTS idx_documents_current_version
  ON documents (folder_id, is_current_version) WHERE is_current_version = true;
