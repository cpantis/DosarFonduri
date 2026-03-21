-- Add instanceIndex to project_elements for multi-instance cardinality support
-- When elementDefinitions.minCount > 1, multiple rows with different instanceIndex
-- values represent each required instance (e.g., 3 price quotes → instances 0, 1, 2)
ALTER TABLE project_elements ADD COLUMN IF NOT EXISTS instance_index integer NOT NULL DEFAULT 0;

-- Add 'ai' to placeholder_mapped_by enum for AI-powered semantic mapping
DO $$ BEGIN
  ALTER TYPE placeholder_mapped_by ADD VALUE IF NOT EXISTS 'ai';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add 'template_mapping' to ai_agent enum for AI usage tracking
DO $$ BEGIN
  ALTER TYPE ai_agent ADD VALUE IF NOT EXISTS 'template_mapping';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
