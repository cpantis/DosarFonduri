-- Solomon persistent memory: conversation summaries + cross-project learnings

-- Conversation summary (injected at start of next conversation on same project)
ALTER TABLE solomon_conversations ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE solomon_conversations ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMPTZ;

-- Case memory: persistent learnings per cabinet (cross-project)
CREATE TABLE IF NOT EXISTS solomon_case_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES solomon_conversations(id) ON DELETE SET NULL,
  memo_type TEXT NOT NULL,
  content TEXT NOT NULL,
  context TEXT,
  confidence DECIMAL(3,2) DEFAULT 0.80,
  program_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS case_mem_org_idx ON solomon_case_memory(organization_id);
CREATE INDEX IF NOT EXISTS case_mem_project_idx ON solomon_case_memory(project_id);
CREATE INDEX IF NOT EXISTS case_mem_program_idx ON solomon_case_memory(program_code);
