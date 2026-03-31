-- FORM-2: Form data table for field values + page approvals
CREATE TABLE IF NOT EXISTS form_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  form_spec_id UUID NOT NULL REFERENCES form_specs(id) ON DELETE CASCADE,
  field_values JSONB NOT NULL DEFAULT '{}',
  field_sources JSONB DEFAULT '{}',
  page_approvals JSONB NOT NULL DEFAULT '{}',
  completion_percent INTEGER DEFAULT 0,
  approved_pages_count INTEGER DEFAULT 0,
  total_pages INTEGER,
  all_pages_approved BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS formdata_project_idx ON form_data(project_id);
CREATE INDEX IF NOT EXISTS formdata_formspec_idx ON form_data(form_spec_id);
CREATE UNIQUE INDEX IF NOT EXISTS formdata_project_form_uq ON form_data(project_id, form_spec_id);
