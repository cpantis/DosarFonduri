-- Drop legacy expires_at column from cabinet_codes (exists in 0000 migration but removed from schema)
ALTER TABLE "cabinet_codes" DROP COLUMN IF EXISTS "expires_at";
