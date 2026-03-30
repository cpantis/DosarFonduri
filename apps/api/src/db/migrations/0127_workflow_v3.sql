-- Migration 0127: Solomon Workflow v3 — phases, narrative thread, element taxonomy, budget items
-- Adds structured workflow tracking (6 phases, 12 Q-uri) to the project lifecycle

-- ============================================================
-- 1. PROJECTS — workflow + narrative columns
-- ============================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS narrative_thread JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS current_phase INTEGER DEFAULT 1;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS current_question INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tema_proiect VARCHAR(255);

-- Constraints on phase/question ranges
DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT chk_current_phase CHECK (current_phase BETWEEN 1 AND 6);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT chk_current_question CHECK (current_question BETWEEN 0 AND 11);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS proj_phase_idx ON projects(current_phase);

-- ============================================================
-- 2. ELEMENT_DEFINITIONS — taxonomy (7 types + groups + phases)
-- ============================================================

ALTER TABLE element_definitions ADD COLUMN IF NOT EXISTS element_type VARCHAR(20) NOT NULL DEFAULT 'scalar';
ALTER TABLE element_definitions ADD COLUMN IF NOT EXISTS group_key VARCHAR(100);
ALTER TABLE element_definitions ADD COLUMN IF NOT EXISTS parent_group_key VARCHAR(100);
ALTER TABLE element_definitions ADD COLUMN IF NOT EXISTS phase INTEGER;

-- Constraint on element_type values
DO $$ BEGIN
  ALTER TABLE element_definitions ADD CONSTRAINT chk_element_type
    CHECK (element_type IN ('scalar', 'group_field', 'group_nested', 'narrative', 'calculated', 'reference', 'document_ref'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Constraint on phase range
DO $$ BEGIN
  ALTER TABLE element_definitions ADD CONSTRAINT chk_elem_def_phase CHECK (phase IS NULL OR phase BETWEEN 1 AND 6);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS elem_def_phase_idx ON element_definitions(phase);
CREATE INDEX IF NOT EXISTS elem_def_group_idx ON element_definitions(group_key);
CREATE INDEX IF NOT EXISTS elem_def_type_idx ON element_definitions(element_type);

-- ============================================================
-- 3. PROJECT_ELEMENTS — parent instance index for nested groups
-- ============================================================

ALTER TABLE project_elements ADD COLUMN IF NOT EXISTS parent_instance_index INTEGER;

CREATE INDEX IF NOT EXISTS proj_el_parent_idx ON project_elements(parent_instance_index);

-- ============================================================
-- 4. PROJECT_CHECKLIST — document validity tracking
-- ============================================================

ALTER TABLE project_checklist ADD COLUMN IF NOT EXISTS issued_at TIMESTAMP;
ALTER TABLE project_checklist ADD COLUMN IF NOT EXISTS valid_until TIMESTAMP;
ALTER TABLE project_checklist ADD COLUMN IF NOT EXISTS validity_days INTEGER;

-- ============================================================
-- 5. BUDGET_ITEMS — new table for Q4 Dimensionare financiară
-- ============================================================

CREATE TABLE IF NOT EXISTS budget_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Identification
  category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(255),
  description VARCHAR(500) NOT NULL,
  -- Values
  unit_cost DECIMAL(15, 2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_cost DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  -- Eligibility
  eligible BOOLEAN NOT NULL DEFAULT true,
  eligibility_notes TEXT,
  -- Guide reference (price ceiling)
  guide_ref_table_id UUID REFERENCES guide_reference_tables(id) ON DELETE SET NULL,
  guide_max_price DECIMAL(15, 2),
  exceeds_ceiling BOOLEAN DEFAULT false,
  -- Link to element group
  element_group_instance INTEGER,
  -- Metadata
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS budget_project_idx ON budget_items(project_id);
CREATE INDEX IF NOT EXISTS budget_org_idx ON budget_items(organization_id);

-- ============================================================
-- 6. VERIFICATION
-- ============================================================

-- All existing projects get current_phase = 1 (default)
-- All existing element_definitions get element_type = 'scalar' (default)
-- No data loss — all new columns are nullable or have defaults
