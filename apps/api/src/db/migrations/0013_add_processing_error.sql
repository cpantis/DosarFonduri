-- Add processing_error column to persist error messages for failed document processing
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "processing_error" text;
