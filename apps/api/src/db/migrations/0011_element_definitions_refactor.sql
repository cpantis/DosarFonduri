-- Migration: element_definitions refactor
-- Adds element_definitions as canonical source of truth (from guide processing)
-- Adds template_placeholder_mapping to decouple templates from being source of truth
-- Adds element_def_id to project_elements and element_rule_links (nullable for backward compat)

-- New enums
DO $$ BEGIN
  CREATE TYPE "element_category" AS ENUM ('beneficiary', 'farm', 'investment', 'location', 'financial', 'legal', 'technical', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "element_data_type" AS ENUM ('number', 'text', 'enum', 'boolean', 'date', 'document_ref', 'list_items');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "placeholder_mapped_by" AS ENUM ('auto', 'manual');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Extend element_source enum with new values
DO $$ BEGIN
  ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'document_extracted';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'onrc_auto';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'anaf_auto';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'solomon_chat';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'consultant_manual';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'derived';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'ghid';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- element_definitions table
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

-- template_placeholder_mapping table
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

-- Add element_def_id to project_elements (nullable for backward compat)
ALTER TABLE "project_elements" ADD COLUMN IF NOT EXISTS "element_def_id" uuid REFERENCES "element_definitions"("id");
CREATE INDEX IF NOT EXISTS "proj_el_elemdef_idx" ON "project_elements" ("element_def_id");

-- Make template_element_id nullable (was NOT NULL)
ALTER TABLE "project_elements" ALTER COLUMN "template_element_id" DROP NOT NULL;

-- Add element_def_id to element_rule_links (nullable for backward compat)
ALTER TABLE "element_rule_links" ADD COLUMN IF NOT EXISTS "element_def_id" uuid REFERENCES "element_definitions"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "elem_rule_elemdef_idx" ON "element_rule_links" ("element_def_id");

-- Make template_element_id nullable in element_rule_links (was NOT NULL)
ALTER TABLE "element_rule_links" ALTER COLUMN "template_element_id" DROP NOT NULL;
