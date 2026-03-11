-- Migration: Upload audit fixes (ETAPA 1)
-- Adds mime_type, file_hash to documents table
-- Adds 'failed' to doc_status enum
-- Adds 'client_doc' is already in doc_processing_type enum

-- Add 'failed' to doc_status enum (if not exists)
ALTER TYPE "public"."doc_status" ADD VALUE IF NOT EXISTS 'failed';--> statement-breakpoint

-- Add mime_type column (NOT NULL with default for existing rows)
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "mime_type" varchar(100) NOT NULL DEFAULT 'application/octet-stream';--> statement-breakpoint

-- Add file_hash column for duplicate detection
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_hash" varchar(64);--> statement-breakpoint

-- Create index on file_hash for fast duplicate lookups
CREATE INDEX IF NOT EXISTS "doc_hash_idx" ON "documents" ("file_hash") WHERE "file_hash" IS NOT NULL;
