-- 0100: Add blueprint JSONB column to documents table
-- Stores AI-generated document understanding per template (Phase 1 of context-aware COMPOSE)
-- Generated once per template, cached and reused across all projects

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'blueprint'
  ) THEN
    ALTER TABLE documents ADD COLUMN blueprint jsonb;
    COMMENT ON COLUMN documents.blueprint IS 'AI-generated document blueprint for COMPOSE mode — section purposes, required elements, evaluator expectations';
  END IF;
END $$;

-- Index for finding templates that have blueprints
CREATE INDEX IF NOT EXISTS idx_documents_blueprint_not_null
  ON documents ((blueprint IS NOT NULL))
  WHERE blueprint IS NOT NULL;
