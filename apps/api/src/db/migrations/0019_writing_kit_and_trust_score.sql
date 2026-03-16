-- Migration 0019: Writing kit support + guide trust score
-- 1. Make solomonKnowledge.organizationId nullable (for global writing kit entries)
-- 2. Add trustScore + completenessReport to documents table (for guide completeness verification)

-- Step 1: Allow global solomonKnowledge entries (organizationId = NULL)
ALTER TABLE solomon_knowledge ALTER COLUMN organization_id DROP NOT NULL;

-- Step 2: Add trust score columns to documents (for processed guides)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS trust_score DECIMAL(3,2);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS completeness_report JSONB;

-- Step 3: Compose section versions (feedback loop — AI vs consultant edits)
CREATE TABLE IF NOT EXISTS compose_section_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_document_id UUID NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  section_marker VARCHAR(255) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  source VARCHAR(50) NOT NULL, -- 'neemia_ai' or 'consultant_edit'
  edited_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
