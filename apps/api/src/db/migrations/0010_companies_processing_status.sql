ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "processing_status" varchar(20) DEFAULT 'idle';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "processing_error" text;
