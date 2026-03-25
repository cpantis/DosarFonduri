-- Fix Sonnet model ID: claude-sonnet-4-6-20250514 does not exist on Anthropic API
-- Correct ID is claude-sonnet-4-6 (matching claude-opus-4-6 format without date suffix)

UPDATE "organization_config"
SET "neemia_model" = 'claude-sonnet-4-6'
WHERE "neemia_model" = 'claude-sonnet-4-6-20250514';

UPDATE "organization_config"
SET "reguli_fixe_model" = 'claude-sonnet-4-6'
WHERE "reguli_fixe_model" = 'claude-sonnet-4-6-20250514';

-- Also fix any leftover old format
UPDATE "organization_config"
SET "neemia_model" = 'claude-sonnet-4-6'
WHERE "neemia_model" = 'claude-sonnet-4-20250514';

UPDATE "organization_config"
SET "reguli_fixe_model" = 'claude-sonnet-4-6'
WHERE "reguli_fixe_model" = 'claude-sonnet-4-20250514';

-- Update column defaults
ALTER TABLE "organization_config"
  ALTER COLUMN "neemia_model" SET DEFAULT 'claude-sonnet-4-6';

ALTER TABLE "organization_config"
  ALTER COLUMN "reguli_fixe_model" SET DEFAULT 'claude-sonnet-4-6';
