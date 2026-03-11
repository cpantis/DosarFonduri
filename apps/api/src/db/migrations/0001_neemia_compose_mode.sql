-- Migration: Add COMPOSE mode support to Neemia document generation
-- Adds generation_mode enum, and new columns to documents + project_documents tables

CREATE TYPE "public"."generation_mode" AS ENUM('fill', 'compose');--> statement-breakpoint

ALTER TABLE "documents" ADD COLUMN "generation_mode" "generation_mode" DEFAULT 'fill';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "compose_config" jsonb;--> statement-breakpoint

ALTER TABLE "project_documents" ADD COLUMN "generation_mode" "generation_mode" DEFAULT 'fill';--> statement-breakpoint
ALTER TABLE "project_documents" ADD COLUMN "compose_content" jsonb;
