-- Migration 0021: Create 3 tables defined in schema.ts but never created
-- Tables: guide_reference_tables, rule_reference_links, element_rule_links
-- Plus their associated enum types

-- ─── ENUMS ───

DO $$ BEGIN
  CREATE TYPE "ref_table_type" AS ENUM ('lookup', 'classification', 'list', 'matrix');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ref_extracted_by" AS ENUM ('ai', 'manual');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ref_usage" AS ENUM ('validates', 'scores', 'classifies');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "element_role_link" AS ENUM ('input', 'output', 'constraint');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── guide_reference_tables ───

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

-- ─── element_rule_links ───
-- Includes element_def_id (from migration 0011), CHECK constraint (from 0017),
-- and unique index (from 0018) since those migrations can't ALTER a non-existent table.

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

-- ─── rule_reference_links ───

CREATE TABLE IF NOT EXISTS "rule_reference_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "rule_id" uuid NOT NULL REFERENCES "rules"("id") ON DELETE CASCADE,
  "reference_table_id" uuid NOT NULL REFERENCES "guide_reference_tables"("id") ON DELETE CASCADE,
  "usage" "ref_usage" NOT NULL,
  "description" text
);

CREATE INDEX IF NOT EXISTS "rule_ref_rule_idx" ON "rule_reference_links" ("rule_id");
CREATE INDEX IF NOT EXISTS "rule_ref_table_idx" ON "rule_reference_links" ("reference_table_id");
