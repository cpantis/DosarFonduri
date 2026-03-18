-- Add rule_key and needs_review columns to rules table
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "rule_key" varchar(255);
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "needs_review" boolean NOT NULL DEFAULT false;
