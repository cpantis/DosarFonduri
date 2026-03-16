-- W2.8: Add UNIQUE constraint on (ruleId, elementDefId) to prevent duplicate links
-- W6.6: Add organizationId to projectEligibility and templatePlaceholderMapping for org-scoped queries

-- Remove duplicates before adding constraint (keep first occurrence)
-- Wrapped in existence check because element_rule_links may not exist yet (created by 0099_alignment)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'element_rule_links') THEN
    DELETE FROM element_rule_links a
    USING element_rule_links b
    WHERE a.id > b.id
      AND a.rule_id = b.rule_id
      AND a.element_def_id IS NOT NULL
      AND a.element_def_id = b.element_def_id;

    CREATE UNIQUE INDEX IF NOT EXISTS "elem_rule_unique_rule_elemdef_idx"
      ON "element_rule_links" ("rule_id", "element_def_id")
      WHERE "element_def_id" IS NOT NULL;
  END IF;
END $$;

-- W6.6: Add organizationId to projectEligibility
ALTER TABLE "project_eligibility"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE;

-- Backfill organizationId from projects table
UPDATE "project_eligibility" pe
SET "organization_id" = p."organization_id"
FROM "projects" p
WHERE pe."project_id" = p."id"
  AND pe."organization_id" IS NULL;

-- Add index for org-scoped queries
CREATE INDEX IF NOT EXISTS "proj_elig_org_idx" ON "project_eligibility" ("organization_id");
