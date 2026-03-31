-- RAG v2 Sprint 3: Add Solomon phase tracking + compose brief to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS solomon_phase JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS compose_brief JSONB;
