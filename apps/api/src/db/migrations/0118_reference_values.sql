-- Reference values: dynamic calculation parameters per organization
-- (TVA rate, EUR exchange rate, IMM thresholds, etc.)
CREATE TABLE IF NOT EXISTS "reference_values" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "key" varchar(100) NOT NULL,
  "value" varchar(255) NOT NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ref_val_org_key_idx" ON "reference_values" ("organization_id", "key");
