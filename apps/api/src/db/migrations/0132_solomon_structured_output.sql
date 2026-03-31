-- Sprint 5: Solomon structured output tables + checklist source reference

-- Solomon eligibility conclusions (one row per verified condition)
CREATE TABLE IF NOT EXISTS solomon_eligibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  rule_category TEXT,
  status TEXT NOT NULL,
  evidence TEXT,
  confidence DECIMAL(3,2),
  source_phase TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sol_elig_project_idx ON solomon_eligibility(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS sol_elig_rule_uq ON solomon_eligibility(project_id, rule_name);

-- Solomon scoring estimates (one row per evaluated criterion)
CREATE TABLE IF NOT EXISTS solomon_scoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  criterion_name TEXT NOT NULL,
  criterion_category TEXT,
  points_estimated INTEGER,
  max_points INTEGER,
  evidence TEXT,
  confidence DECIMAL(3,2),
  source_phase TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sol_score_project_idx ON solomon_scoring(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS sol_score_criterion_uq ON solomon_scoring(project_id, criterion_name);

-- Add source_reference to existing project_checklist for ghid references
ALTER TABLE project_checklist ADD COLUMN IF NOT EXISTS source_reference TEXT;
