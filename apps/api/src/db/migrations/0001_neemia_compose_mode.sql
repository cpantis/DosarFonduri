-- Migration: Add COMPOSE mode support to Neemia document generation
-- Adds generation_mode enum, and new columns to documents + project_documents tables

DO $$ BEGIN
  CREATE TYPE "public"."generation_mode" AS ENUM('fill', 'compose');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "generation_mode" "generation_mode" DEFAULT 'fill';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "compose_config" jsonb;--> statement-breakpoint

ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "generation_mode" "generation_mode" DEFAULT 'fill';--> statement-breakpoint
ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "compose_content" jsonb;
