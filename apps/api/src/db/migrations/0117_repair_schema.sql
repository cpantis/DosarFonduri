-- Migration 0117: Repair/ensure all schema objects exist
-- This is a safety-net migration that re-applies critical DDL from 0099-0116
-- in case any were partially applied due to the BEGIN/COMMIT connection pool bug.
-- All statements are idempotent (IF NOT EXISTS / DROP IF EXISTS + ADD).

-- ═══════════════════════════════════════════════════════
-- ENUMS (from 0099)
-- ═══════════════════════════════════════════════════════

DO $$ BEGIN CREATE TYPE "element_category" AS ENUM ('beneficiary', 'farm', 'investment', 'location', 'financial', 'legal', 'technical', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "element_data_type" AS ENUM ('number', 'text', 'enum', 'boolean', 'date', 'document_ref', 'list_items'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "placeholder_mapped_by" AS ENUM ('auto', 'manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ref_table_type" AS ENUM ('lookup', 'classification', 'list', 'matrix'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ref_extracted_by" AS ENUM ('ai', 'manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ref_usage" AS ENUM ('validates', 'scores', 'classifies'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "element_role_link" AS ENUM ('input', 'output', 'constraint'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "generation_mode" AS ENUM ('fill', 'compose'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "generation_context" AS ENUM ('work', 'submission'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "validation_status" AS ENUM ('pending', 'valid', 'warning', 'invalid'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enum values that might be missing
DO $$ BEGIN ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'onrc_auto'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'anaf_auto'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'solomon_chat'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'consultant_manual'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "element_source" ADD VALUE IF NOT EXISTS 'derived'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "placeholder_mapped_by" ADD VALUE IF NOT EXISTS 'ai'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "doc_processing_type" ADD VALUE IF NOT EXISTS 'reference_data'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════
-- TABLES (from 0099, 0106, 0108, 0109, 0115)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "element_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "guide_document_id" uuid REFERENCES "documents"("id") ON DELETE CASCADE,
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
  "min_count" integer NOT NULL DEFAULT 1,
  "max_count" integer,
  "help_text" text,
  "is_derived" boolean NOT NULL DEFAULT false,
  "derivation_formula" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "elem_def_guide_idx" ON "element_definitions" ("guide_document_id");
CREATE INDEX IF NOT EXISTS "elem_def_org_idx" ON "element_definitions" ("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "elem_def_key_guide_idx" ON "element_definitions" ("element_key", "guide_document_id");

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

CREATE TABLE IF NOT EXISTS "template_placeholder_mapping" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "placeholder_key" varchar(255) NOT NULL,
  "element_def_id" uuid NOT NULL REFERENCES "element_definitions"("id") ON DELETE CASCADE,
  "mapped_by" "placeholder_mapped_by" NOT NULL DEFAULT 'auto',
  "confidence" numeric(3, 2),
  "validated" boolean NOT NULL DEFAULT false,
  "validated_by" uuid REFERENCES "users"("id"),
  "validated_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "tpl_map_template_idx" ON "template_placeholder_mapping" ("template_document_id");
CREATE INDEX IF NOT EXISTS "tpl_map_element_idx" ON "template_placeholder_mapping" ("element_def_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tpl_map_unique_idx" ON "template_placeholder_mapping" ("template_document_id", "placeholder_key");

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

CREATE TABLE IF NOT EXISTS "rule_reference_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "rule_id" uuid NOT NULL REFERENCES "rules"("id") ON DELETE CASCADE,
  "reference_table_id" uuid NOT NULL REFERENCES "guide_reference_tables"("id") ON DELETE CASCADE,
  "usage" "ref_usage" NOT NULL,
  "description" text
);
CREATE INDEX IF NOT EXISTS "rule_ref_rule_idx" ON "rule_reference_links" ("rule_id");
CREATE INDEX IF NOT EXISTS "rule_ref_table_idx" ON "rule_reference_links" ("reference_table_id");

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

CREATE TABLE IF NOT EXISTS "session_checklist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "folder_id" uuid NOT NULL REFERENCES "document_folders"("id") ON DELETE CASCADE,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "label" varchar(500) NOT NULL,
  "done" boolean NOT NULL DEFAULT false,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "company_elements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "element_key" varchar(255) NOT NULL,
  "value" text,
  "source" varchar(50) NOT NULL DEFAULT 'onrc_auto',
  "source_document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "comp_elem_company_idx" ON "company_elements" ("company_id");
CREATE UNIQUE INDEX IF NOT EXISTS "comp_elem_unique_idx" ON "company_elements" ("company_id", "element_key");

CREATE TABLE IF NOT EXISTS "custom_labels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "entity_type" varchar(50) NOT NULL,
  "entity_id" uuid NOT NULL,
  "label" varchar(100) NOT NULL,
  "color" varchar(20) DEFAULT '#4d8bff',
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "custom_labels_entity_idx" ON "custom_labels" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "custom_labels_org_idx" ON "custom_labels" ("organization_id");

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "prt_token_hash_idx" ON "password_reset_tokens" ("token_hash");

-- ═══════════════════════════════════════════════════════
-- COLUMNS (from 0099, 0104, 0106, 0107, 0110)
-- ═══════════════════════════════════════════════════════

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "processing_result" jsonb;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "trust_score" numeric(3, 2);
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "completeness_report" jsonb;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "mime_type" varchar(100) NOT NULL DEFAULT 'application/octet-stream';
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_hash" varchar(64);
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "generation_mode" "generation_mode" DEFAULT 'fill';
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "compose_config" jsonb;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "document_type_class" "document_type_class";
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "classification_confidence" decimal(3,2);
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "processing_error" text;

ALTER TABLE "project_elements" ADD COLUMN IF NOT EXISTS "element_def_id" uuid;
ALTER TABLE "project_elements" ADD COLUMN IF NOT EXISTS "instance_index" integer NOT NULL DEFAULT 0;
ALTER TABLE "project_elements" ADD COLUMN IF NOT EXISTS "validation_status" "validation_status" NOT NULL DEFAULT 'pending';
ALTER TABLE "project_elements" ADD COLUMN IF NOT EXISTS "validation_details" jsonb;

ALTER TABLE "project_eligibility" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "generation_mode" "generation_mode" DEFAULT 'fill';
ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "compose_content" jsonb;
ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "generation_context" "generation_context" DEFAULT 'work';

ALTER TABLE "element_definitions" ADD COLUMN IF NOT EXISTS "min_count" integer NOT NULL DEFAULT 1;
ALTER TABLE "element_definitions" ADD COLUMN IF NOT EXISTS "max_count" integer;
ALTER TABLE "session_checklist" ADD COLUMN IF NOT EXISTS "done" boolean NOT NULL DEFAULT false;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "size" bigint NOT NULL DEFAULT 0;

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "processing_status" varchar(20) DEFAULT 'idle';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "processing_error" text;

-- Nullable fixes
ALTER TABLE "project_elements" ALTER COLUMN "template_element_id" DROP NOT NULL;
ALTER TABLE "solomon_knowledge" ALTER COLUMN "organization_id" DROP NOT NULL;
ALTER TABLE "files" ALTER COLUMN "uploaded_by" DROP NOT NULL;
ALTER TABLE "element_definitions" ALTER COLUMN "guide_document_id" DROP NOT NULL;

-- ═══════════════════════════════════════════════════════
-- FK CONSTRAINT REPAIRS (from 0099, 0111, 0112, 0116)
-- Drop + re-add to ensure correct onDelete policy
-- ═══════════════════════════════════════════════════════

-- 0116: project_elements FK to SET NULL
ALTER TABLE "project_elements" DROP CONSTRAINT IF EXISTS "project_elements_template_element_id_template_elements_id_fk";
ALTER TABLE "project_elements" ADD CONSTRAINT "project_elements_template_element_id_template_elements_id_fk"
  FOREIGN KEY ("template_element_id") REFERENCES "template_elements"("id") ON DELETE SET NULL;

ALTER TABLE "project_elements" DROP CONSTRAINT IF EXISTS "project_elements_element_def_id_element_definitions_id_fk";
ALTER TABLE "project_elements" ADD CONSTRAINT "project_elements_element_def_id_element_definitions_id_fk"
  FOREIGN KEY ("element_def_id") REFERENCES "element_definitions"("id") ON DELETE SET NULL;

-- 0099: org cascades
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_organization_id_organizations_id_fk";
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_organization_id_organizations_id_fk";
ALTER TABLE "companies" ADD CONSTRAINT "companies_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_organization_id_organizations_id_fk";
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_organization_id_organizations_id_fk";
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "rules" DROP CONSTRAINT IF EXISTS "rules_organization_id_organizations_id_fk";
ALTER TABLE "rules" ADD CONSTRAINT "rules_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "template_elements" DROP CONSTRAINT IF EXISTS "template_elements_organization_id_organizations_id_fk";
ALTER TABLE "template_elements" ADD CONSTRAINT "template_elements_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "document_folders" DROP CONSTRAINT IF EXISTS "document_folders_organization_id_organizations_id_fk";
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "files_organization_id_organizations_id_fk";
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- 0111: user FK set null
ALTER TABLE "audit_log" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "audit_log_user_id_users_id_fk";
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "ai_usage_log" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "ai_usage_log" DROP CONSTRAINT IF EXISTS "ai_usage_log_user_id_users_id_fk";
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "solomon_conversations" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "solomon_conversations" DROP CONSTRAINT IF EXISTS "solomon_conversations_user_id_users_id_fk";
ALTER TABLE "solomon_conversations" ADD CONSTRAINT "solomon_conversations_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "projects" ALTER COLUMN "consultant_id" DROP NOT NULL;
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_consultant_id_users_id_fk";
ALTER TABLE "projects" ADD CONSTRAINT "projects_consultant_id_users_id_fk"
  FOREIGN KEY ("consultant_id") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_locked_by_users_id_fk";
ALTER TABLE "projects" ADD CONSTRAINT "projects_locked_by_users_id_fk"
  FOREIGN KEY ("locked_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "document_folders" ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "document_folders" DROP CONSTRAINT IF EXISTS "document_folders_created_by_users_id_fk";
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "project_elements" DROP CONSTRAINT IF EXISTS "project_elements_confirmed_by_users_id_fk";
ALTER TABLE "project_elements" ADD CONSTRAINT "project_elements_confirmed_by_users_id_fk"
  FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "project_eligibility" DROP CONSTRAINT IF EXISTS "project_eligibility_override_by_users_id_fk";
ALTER TABLE "project_eligibility" ADD CONSTRAINT "project_eligibility_override_by_users_id_fk"
  FOREIGN KEY ("override_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "project_documents" DROP CONSTRAINT IF EXISTS "project_documents_generated_by_users_id_fk";
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_generated_by_users_id_fk"
  FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "project_documents" DROP CONSTRAINT IF EXISTS "project_documents_validated_by_users_id_fk";
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_validated_by_users_id_fk"
  FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL;

-- 0112: file FK fixes
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_file_id_files_id_fk";
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_id_files_id_fk"
  FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE;

ALTER TABLE "company_financials" DROP CONSTRAINT IF EXISTS "company_financials_file_id_files_id_fk";
ALTER TABLE "company_financials" ADD CONSTRAINT "company_financials_file_id_files_id_fk"
  FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL;

ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_certificat_file_id_files_id_fk";
ALTER TABLE "companies" ADD CONSTRAINT "companies_certificat_file_id_files_id_fk"
  FOREIGN KEY ("certificat_file_id") REFERENCES "files"("id") ON DELETE SET NULL;

ALTER TABLE "project_documents" DROP CONSTRAINT IF EXISTS "project_documents_generated_file_id_files_id_fk";
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_generated_file_id_files_id_fk"
  FOREIGN KEY ("generated_file_id") REFERENCES "files"("id") ON DELETE SET NULL;

ALTER TABLE "project_elements" DROP CONSTRAINT IF EXISTS "project_elements_source_document_id_documents_id_fk";
ALTER TABLE "project_elements" ADD CONSTRAINT "project_elements_source_document_id_documents_id_fk"
  FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE SET NULL;

ALTER TABLE "project_eligibility" DROP CONSTRAINT IF EXISTS "project_eligibility_rule_id_rules_id_fk";
ALTER TABLE "project_eligibility" ADD CONSTRAINT "project_eligibility_rule_id_rules_id_fk"
  FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE CASCADE;

ALTER TABLE "project_documents" DROP CONSTRAINT IF EXISTS "project_documents_template_document_id_documents_id_fk";
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_template_document_id_documents_id_fk"
  FOREIGN KEY ("template_document_id") REFERENCES "documents"("id") ON DELETE CASCADE;

ALTER TABLE "project_checklist" DROP CONSTRAINT IF EXISTS "project_checklist_template_id_documents_id_fk";
ALTER TABLE "project_checklist" ADD CONSTRAINT "project_checklist_template_id_documents_id_fk"
  FOREIGN KEY ("template_id") REFERENCES "documents"("id") ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════
-- INDEXES (from 0116)
-- ═══════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS "proj_elig_project_idx" ON "project_eligibility" ("project_id");
CREATE INDEX IF NOT EXISTS "proj_doc_project_idx" ON "project_documents" ("project_id");
CREATE INDEX IF NOT EXISTS "proj_check_project_idx" ON "project_checklist" ("project_id");
CREATE INDEX IF NOT EXISTS "solomon_conv_project_idx" ON "solomon_conversations" ("project_id");
CREATE INDEX IF NOT EXISTS "rules_doc_idx" ON "rules" ("document_id");
CREATE INDEX IF NOT EXISTS "rules_org_idx" ON "rules" ("organization_id");
CREATE INDEX IF NOT EXISTS "tmpl_el_org_idx" ON "template_elements" ("organization_id");
CREATE INDEX IF NOT EXISTS "users_org_idx" ON "users" ("organization_id");
CREATE INDEX IF NOT EXISTS "files_org_idx" ON "files" ("organization_id");
CREATE INDEX IF NOT EXISTS "csv_projdoc_idx" ON "compose_section_versions" ("project_document_id");
CREATE INDEX IF NOT EXISTS "comp_assoc_company_idx" ON "company_associates" ("company_id");
CREATE INDEX IF NOT EXISTS "comp_admin_company_idx" ON "company_administrators" ("company_id");
CREATE INDEX IF NOT EXISTS "comp_ifm_company_idx" ON "company_if_members" ("company_id");
CREATE INDEX IF NOT EXISTS "proj_elig_rule_idx" ON "project_eligibility" ("rule_id");
CREATE INDEX IF NOT EXISTS "proj_doc_template_idx" ON "project_documents" ("template_document_id");
CREATE INDEX IF NOT EXISTS "proj_elig_org_idx" ON "project_eligibility" ("organization_id");
CREATE INDEX IF NOT EXISTS "proj_el_elemdef_idx" ON "project_elements" ("element_def_id");

-- Backfill organization_id on project_eligibility (idempotent — only updates NULLs)
UPDATE "project_eligibility" pe
SET "organization_id" = p."organization_id"
FROM "projects" p
WHERE pe."project_id" = p."id"
  AND pe."organization_id" IS NULL;
