-- Add validation columns to template_placeholder_mapping
ALTER TABLE "template_placeholder_mapping" ADD COLUMN IF NOT EXISTS "validated" boolean NOT NULL DEFAULT false;
ALTER TABLE "template_placeholder_mapping" ADD COLUMN IF NOT EXISTS "validated_by" uuid REFERENCES "users"("id");
ALTER TABLE "template_placeholder_mapping" ADD COLUMN IF NOT EXISTS "validated_at" timestamp;
