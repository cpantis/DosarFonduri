-- Upgrade Sonnet model references from 4.0 to 4.6
-- Updates existing organization_config rows that still reference the old model ID

UPDATE "organization_config"
SET "neemia_model" = 'claude-sonnet-4-6-20250514'
WHERE "neemia_model" = 'claude-sonnet-4-20250514';

UPDATE "organization_config"
SET "reguli_fixe_model" = 'claude-sonnet-4-6-20250514'
WHERE "reguli_fixe_model" = 'claude-sonnet-4-20250514';

-- Also update the column defaults at DB level (matches schema.ts)
ALTER TABLE "organization_config"
  ALTER COLUMN "neemia_model" SET DEFAULT 'claude-sonnet-4-6-20250514';

ALTER TABLE "organization_config"
  ALTER COLUMN "reguli_fixe_model" SET DEFAULT 'claude-sonnet-4-6-20250514';
