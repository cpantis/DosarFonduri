-- Migration: ETAPA 4 Validation & Scoring
-- Adds validation_status, validation_details to project_elements
-- Adds element_audit_log, scoring_criteria, project_scores tables

-- Add validation_status enum
DO $$ BEGIN
  CREATE TYPE "public"."validation_status" AS ENUM('pending', 'valid', 'warning', 'invalid');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Add validation columns to project_elements
ALTER TABLE "project_elements" ADD COLUMN IF NOT EXISTS "validation_status" "validation_status" NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "project_elements" ADD COLUMN IF NOT EXISTS "validation_details" jsonb;--> statement-breakpoint

-- Element audit log table
CREATE TABLE IF NOT EXISTS "element_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_element_id" uuid NOT NULL REFERENCES "project_elements"("id") ON DELETE CASCADE,
  "old_value" text,
  "new_value" text,
  "old_validation_status" "validation_status",
  "new_validation_status" "validation_status",
  "changed_by" uuid REFERENCES "users"("id"),
  "change_source" "element_source" NOT NULL DEFAULT 'manual',
  "changed_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_element_idx" ON "element_audit_log" ("project_element_id");--> statement-breakpoint

-- Scoring criteria table
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
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scoring_doc_idx" ON "scoring_criteria" ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scoring_org_idx" ON "scoring_criteria" ("organization_id");--> statement-breakpoint

-- Project scores table
CREATE TABLE IF NOT EXISTS "project_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "criteria_id" uuid NOT NULL REFERENCES "scoring_criteria"("id") ON DELETE CASCADE,
  "points" decimal(5, 2),
  "max_points" decimal(5, 2) NOT NULL,
  "reasoning" text,
  "input_elements" jsonb,
  "evaluated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "score_project_idx" ON "project_scores" ("project_id");
