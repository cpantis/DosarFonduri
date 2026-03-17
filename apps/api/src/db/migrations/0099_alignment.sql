-- DosarFonduri: Alignment migration — schema.ts ↔ DB
-- Date: 2026-03-16
-- Purpose: Resolve ALL differences between Drizzle schema and real DB
-- This migration is fully idempotent (safe to re-run)

BEGIN;

-- ═══════════════════════════════════════════════════════
-- ENUM-URI LIPSĂ
-- ═══════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "element_category" AS ENUM ('beneficiary', 'farm', 'investment', 'location', 'financial', 'legal', 'technical', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "element_data_type" AS ENUM ('number', 'text', 'enum', 'boolean', 'date', 'document_ref', 'list_items');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "placeholder_mapped_by" AS ENUM ('auto', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ref_table_type" AS ENUM ('lookup', 'classification', 'list', 'matrix');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ref_extracted_by" AS ENUM ('ai', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ref_usage" AS ENUM ('validates', 'scores', 'classifies');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "element_role_link" AS ENUM ('input', 'output', 'constraint');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════
-- ENUM VALUES LIPSĂ
-- ═══════════════════════════════════════════════════════

DO $$ BEGIN ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'onrc_auto';     EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'anaf_auto';     EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'solomon_chat';  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'consultant_manual'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'derived';       EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════
-- TABELE LIPSĂ
-- ═══════════════════════════════════════════════════════

-- element_definitions (canonical field definitions from guide processing)
CREATE TABLE IF NOT EXISTS "element_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "guide_document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "element_key" varchar(255) NOT NULL,
  "display_name" varchar(500) NOT NULL,
  "category" "element_category" NOT NULL DEFAULT 'other',
  "data_type" "element_data_type" NOT NULL DEFAULT 'text',
  "unit" varchar(50),
  "enum_values" jsonb,
  "source_priority" jsonb DEFAULT '["document_extracted","solomon_chat","consultant_manual"]'::jsonb,
  "validation_rules" jsonb,
  "used_by_rules" jsonb,
  "used_in_templates" jsonb,
  "lookup_table_id" uuid,
  "collection_order" integer DEFAULT 0,
  "required" boolean NOT NULL DEFAULT false,
  "help_text" text,
  "is_derived" boolean NOT NULL DEFAULT false,
  "derivation_formula" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "elem_def_guide_idx" ON "element_definitions" ("guide_document_id");
CREATE INDEX IF NOT EXISTS "elem_def_org_idx" ON "element_definitions" ("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "elem_def_key_guide_idx" ON "element_definitions" ("element_key", "guide_document_id");

-- guide_reference_tables (structured data from guide annexes)
CREATE TABLE IF NOT EXISTS "guide_reference_tables" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" varchar(500) NOT NULL,
  "description" text,
  "table_type" "ref_table_type" NOT NULL,
  "schema" jsonb,
  "data" jsonb,
  "lookup_key" varchar(100),
  "source_page" integer,
  "source_text" text,
  "extracted_by" "ref_extracted_by" NOT NULL DEFAULT 'ai',
  "validated" boolean NOT NULL DEFAULT false,
  "validated_by" uuid REFERENCES "users"("id"),
  "validated_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ref_table_doc_idx" ON "guide_reference_tables" ("document_id");
CREATE INDEX IF NOT EXISTS "ref_table_org_idx" ON "guide_reference_tables" ("organization_id");

-- template_placeholder_mapping (links template placeholders to element_definitions)
CREATE TABLE IF NOT EXISTS "template_placeholder_mapping" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "placeholder_key" varchar(255) NOT NULL,
  "element_def_id" uuid NOT NULL REFERENCES "element_definitions"("id") ON DELETE CASCADE,
  "mapped_by" "placeholder_mapped_by" NOT NULL DEFAULT 'auto',
  "confidence" numeric(3, 2),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tpl_map_template_idx" ON "template_placeholder_mapping" ("template_document_id");
CREATE INDEX IF NOT EXISTS "tpl_map_element_idx" ON "template_placeholder_mapping" ("element_def_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tpl_map_unique_idx" ON "template_placeholder_mapping" ("template_document_id", "placeholder_key");

-- element_rule_links (links elements ↔ rules)
CREATE TABLE IF NOT EXISTS "element_rule_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_element_id" uuid REFERENCES "template_elements"("id") ON DELETE CASCADE,
  "element_def_id" uuid REFERENCES "element_definitions"("id") ON DELETE CASCADE,
  "rule_id" uuid NOT NULL REFERENCES "rules"("id") ON DELETE CASCADE,
  "role" "element_role_link" NOT NULL,
  "description" text,
  CONSTRAINT "erl_at_least_one_element_ref" CHECK ("template_element_id" IS NOT NULL OR "element_def_id" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "elem_rule_elem_idx" ON "element_rule_links" ("template_element_id");
CREATE INDEX IF NOT EXISTS "elem_rule_elemdef_idx" ON "element_rule_links" ("element_def_id");
CREATE INDEX IF NOT EXISTS "elem_rule_rule_idx" ON "element_rule_links" ("rule_id");
CREATE UNIQUE INDEX IF NOT EXISTS "elem_rule_unique_rule_elemdef_idx"
  ON "element_rule_links" ("rule_id", "element_def_id")
  WHERE "element_def_id" IS NOT NULL;

-- rule_reference_links (links rules ↔ reference tables)
CREATE TABLE IF NOT EXISTS "rule_reference_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "rule_id" uuid NOT NULL REFERENCES "rules"("id") ON DELETE CASCADE,
  "reference_table_id" uuid NOT NULL REFERENCES "guide_reference_tables"("id") ON DELETE CASCADE,
  "usage" "ref_usage" NOT NULL,
  "description" text
);

CREATE INDEX IF NOT EXISTS "rule_ref_rule_idx" ON "rule_reference_links" ("rule_id");
CREATE INDEX IF NOT EXISTS "rule_ref_table_idx" ON "rule_reference_links" ("reference_table_id");

-- compose_section_versions (feedback loop — AI vs consultant edits)
CREATE TABLE IF NOT EXISTS "compose_section_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_document_id" uuid NOT NULL REFERENCES "project_documents"("id") ON DELETE CASCADE,
  "section_marker" varchar(255) NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "content" text NOT NULL,
  "source" varchar(50) NOT NULL,
  "edited_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- ═══════════════════════════════════════════════════════
-- COLOANE LIPSĂ
-- ═══════════════════════════════════════════════════════

-- documents: processing_result, trust_score, completeness_report
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "processing_result" jsonb;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "trust_score" numeric(3, 2);
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "completeness_report" jsonb;

-- project_elements: element_def_id (FK to element_definitions)
ALTER TABLE "project_elements" ADD COLUMN IF NOT EXISTS "element_def_id" uuid REFERENCES "element_definitions"("id");
CREATE INDEX IF NOT EXISTS "proj_el_elemdef_idx" ON "project_elements" ("element_def_id");

-- project_eligibility: organization_id (for org-scoped queries)
-- No inline FK here — explicit constraint added in FK CASCADE FIXES section below
ALTER TABLE "project_eligibility" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
CREATE INDEX IF NOT EXISTS "proj_elig_org_idx" ON "project_eligibility" ("organization_id");

-- Backfill project_eligibility.organization_id from projects table
UPDATE "project_eligibility" pe
SET "organization_id" = p."organization_id"
FROM "projects" p
WHERE pe."project_id" = p."id"
  AND pe."organization_id" IS NULL;

-- ═══════════════════════════════════════════════════════
-- COLUMN TYPE CHANGES
-- ═══════════════════════════════════════════════════════

-- files.size: integer → bigint (supports files > 2GB)
ALTER TABLE "files" ALTER COLUMN "size" SET DATA TYPE bigint;

-- ═══════════════════════════════════════════════════════
-- COLUMN NULLABLE CHANGES
-- ═══════════════════════════════════════════════════════

-- project_elements.template_element_id: NOT NULL → nullable
ALTER TABLE "project_elements" ALTER COLUMN "template_element_id" DROP NOT NULL;

-- solomon_knowledge.organization_id: NOT NULL → nullable (for global writing kit entries)
ALTER TABLE "solomon_knowledge" ALTER COLUMN "organization_id" DROP NOT NULL;

-- files.uploaded_by: NOT NULL → nullable (schema.ts has no .notNull())
-- Note: Only drop if there's no existing data with NULL values
ALTER TABLE "files" ALTER COLUMN "uploaded_by" DROP NOT NULL;

-- ═══════════════════════════════════════════════════════
-- FK CASCADE FIXES
-- schema.ts says ON DELETE CASCADE, DB has NO ACTION
-- ═══════════════════════════════════════════════════════

-- users.organization_id → organizations.id (CASCADE)
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_organization_id_organizations_id_fk";
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- files.organization_id → organizations.id (CASCADE)
ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "files_organization_id_organizations_id_fk";
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- files.uploaded_by → users.id (SET NULL per schema.ts)
ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "files_uploaded_by_users_id_fk";
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk"
  FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL;

-- companies.organization_id → organizations.id (CASCADE)
ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_organization_id_organizations_id_fk";
ALTER TABLE "companies" ADD CONSTRAINT "companies_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- document_folders.organization_id → organizations.id (CASCADE)
ALTER TABLE "document_folders" DROP CONSTRAINT IF EXISTS "document_folders_organization_id_organizations_id_fk";
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- documents.organization_id → organizations.id (CASCADE)
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_organization_id_organizations_id_fk";
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- rules.organization_id → organizations.id (CASCADE)
ALTER TABLE "rules" DROP CONSTRAINT IF EXISTS "rules_organization_id_organizations_id_fk";
ALTER TABLE "rules" ADD CONSTRAINT "rules_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- template_elements.organization_id → organizations.id (CASCADE)
ALTER TABLE "template_elements" DROP CONSTRAINT IF EXISTS "template_elements_organization_id_organizations_id_fk";
ALTER TABLE "template_elements" ADD CONSTRAINT "template_elements_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- projects.organization_id → organizations.id (CASCADE)
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_organization_id_organizations_id_fk";
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- project_eligibility.rule_id → rules.id (CASCADE)
ALTER TABLE "project_eligibility" DROP CONSTRAINT IF EXISTS "project_eligibility_rule_id_rules_id_fk";
ALTER TABLE "project_eligibility" ADD CONSTRAINT "project_eligibility_rule_id_rules_id_fk"
  FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE CASCADE;

-- project_eligibility.organization_id → organizations.id (CASCADE) — just added column above
-- Also drop inline FK from migration 0018 that creates _fkey variant
ALTER TABLE "project_eligibility" DROP CONSTRAINT IF EXISTS "project_eligibility_organization_id_fkey";
ALTER TABLE "project_eligibility" DROP CONSTRAINT IF EXISTS "project_eligibility_organization_id_organizations_id_fk";
ALTER TABLE "project_eligibility" ADD CONSTRAINT "project_eligibility_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- project_documents.template_document_id → documents.id (CASCADE)
ALTER TABLE "project_documents" DROP CONSTRAINT IF EXISTS "project_documents_template_document_id_documents_id_fk";
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_template_document_id_documents_id_fk"
  FOREIGN KEY ("template_document_id") REFERENCES "documents"("id") ON DELETE CASCADE;

-- project_checklist.template_id → documents.id (CASCADE)
ALTER TABLE "project_checklist" DROP CONSTRAINT IF EXISTS "project_checklist_template_id_documents_id_fk";
ALTER TABLE "project_checklist" ADD CONSTRAINT "project_checklist_template_id_documents_id_fk"
  FOREIGN KEY ("template_id") REFERENCES "documents"("id") ON DELETE CASCADE;

-- api_integrations.organization_id → organizations.id (CASCADE)
ALTER TABLE "api_integrations" DROP CONSTRAINT IF EXISTS "api_integrations_organization_id_organizations_id_fk";
ALTER TABLE "api_integrations" ADD CONSTRAINT "api_integrations_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- audit_log.organization_id → organizations.id (CASCADE)
ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "audit_log_organization_id_organizations_id_fk";
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- org_config.organization_id → organizations.id (CASCADE)
ALTER TABLE "org_config" DROP CONSTRAINT IF EXISTS "org_config_organization_id_organizations_id_fk";
ALTER TABLE "org_config" ADD CONSTRAINT "org_config_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- solomon_knowledge.organization_id → organizations.id (CASCADE)
ALTER TABLE "solomon_knowledge" DROP CONSTRAINT IF EXISTS "solomon_knowledge_organization_id_organizations_id_fk";
ALTER TABLE "solomon_knowledge" ADD CONSTRAINT "solomon_knowledge_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- ai_usage_log.organization_id → organizations.id (CASCADE)
ALTER TABLE "ai_usage_log" DROP CONSTRAINT IF EXISTS "ai_usage_log_organization_id_organizations_id_fk";
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════
-- TABELE LIPSĂ — SCORING
-- ═══════════════════════════════════════════════════════

-- scoring_criteria (selection criteria per guide)
CREATE TABLE IF NOT EXISTS "scoring_criteria" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "code" varchar(50) NOT NULL,
  "name" varchar(500) NOT NULL,
  "description" text,
  "max_points" decimal(5, 2) NOT NULL,
  "evaluation_logic" jsonb,
  "category" varchar(100),
  "sort_order" integer DEFAULT 0,
  "source_page" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "scoring_doc_idx" ON "scoring_criteria" ("document_id");
CREATE INDEX IF NOT EXISTS "scoring_org_idx" ON "scoring_criteria" ("organization_id");

-- project_scores (computed per project per criteria)
CREATE TABLE IF NOT EXISTS "project_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "criteria_id" uuid NOT NULL REFERENCES "scoring_criteria"("id") ON DELETE CASCADE,
  "points" decimal(5, 2),
  "max_points" decimal(5, 2) NOT NULL,
  "reasoning" text,
  "input_elements" jsonb,
  "evaluated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "score_project_idx" ON "project_scores" ("project_id");

COMMIT;
