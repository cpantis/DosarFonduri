-- FORM-1: Universal FormSpec table for any form format
CREATE TABLE IF NOT EXISTS form_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '',
  program_code TEXT,
  source_format TEXT NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  spec JSONB NOT NULL,
  reference_data JSONB,
  is_active BOOLEAN DEFAULT true,
  total_fields INTEGER DEFAULT 0,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS formspec_doc_idx ON form_specs(document_id);
CREATE INDEX IF NOT EXISTS formspec_org_idx ON form_specs(organization_id);
