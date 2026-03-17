-- Migration 0023: Create all tables that were lost when 0099_create_missing_tables.sql
-- was deleted and merged into the already-applied 0099_alignment.sql.
-- Fully idempotent (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

BEGIN;

-- ═══════════════════════════════════════════════════════
-- ENUMS (create if missing)
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
-- scoring_criteria
-- ═══════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════
-- project_scores
-- ═══════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════
-- element_definitions
-- ═══════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════
-- guide_reference_tables
-- ═══════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════
-- element_rule_links
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "element_rule_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_element_id" uuid REFERENCES "template_elements"("id") ON DELETE CASCADE,
  "element_def_id" uuid REFERENCES "element_definitions"("id") ON DELETE CASCADE,
  "rule_id" uuid NOT NULL REFERENCES "rules"("id") ON DELETE CASCADE,
  "role" "element_role_link" NOT NULL,
  "description" text
);

CREATE INDEX IF NOT EXISTS "elem_rule_elem_idx" ON "element_rule_links" ("template_element_id");
CREATE INDEX IF NOT EXISTS "elem_rule_elemdef_idx" ON "element_rule_links" ("element_def_id");
CREATE INDEX IF NOT EXISTS "elem_rule_rule_idx" ON "element_rule_links" ("rule_id");
CREATE UNIQUE INDEX IF NOT EXISTS "elem_rule_unique_rule_elemdef_idx"
  ON "element_rule_links" ("rule_id", "element_def_id")
  WHERE "element_def_id" IS NOT NULL;

-- ═══════════════════════════════════════════════════════
-- rule_reference_links
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "rule_reference_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "rule_id" uuid NOT NULL REFERENCES "rules"("id") ON DELETE CASCADE,
  "reference_table_id" uuid NOT NULL REFERENCES "guide_reference_tables"("id") ON DELETE CASCADE,
  "usage" "ref_usage" NOT NULL,
  "description" text
);

CREATE INDEX IF NOT EXISTS "rule_ref_rule_idx" ON "rule_reference_links" ("rule_id");
CREATE INDEX IF NOT EXISTS "rule_ref_table_idx" ON "rule_reference_links" ("reference_table_id");

-- ═══════════════════════════════════════════════════════
-- template_placeholder_mapping
-- ═══════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════
-- MISSING COLUMN: project_elements.element_def_id
-- ═══════════════════════════════════════════════════════

ALTER TABLE "project_elements" ADD COLUMN IF NOT EXISTS "element_def_id" uuid REFERENCES "element_definitions"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "proj_el_elemdef_idx" ON "project_elements" ("element_def_id");

COMMIT;
