-- Company Elements: materialized key/value store for company data
-- Populated automatically from ONRC, ListaFirme, bilanț uploads, and manual edits
-- Used for fast pre-eligibility checking without needing a project

CREATE TABLE IF NOT EXISTS "company_elements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "element_key" varchar(255) NOT NULL,
  "value" text,
  "source" "element_source" NOT NULL DEFAULT 'onrc',
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "comp_el_company_idx" ON "company_elements" ("company_id");
CREATE INDEX IF NOT EXISTS "comp_el_org_idx" ON "company_elements" ("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "comp_el_key_company_idx" ON "company_elements" ("element_key", "company_id");
