-- Add CUI handshake columns to cabinet_codes
-- Provider can tie a code to a specific company (CUI) via listafirme.ro
ALTER TABLE "cabinet_codes" ADD COLUMN IF NOT EXISTS "cui" varchar(20);
ALTER TABLE "cabinet_codes" ADD COLUMN IF NOT EXISTS "company_name" varchar(500);
