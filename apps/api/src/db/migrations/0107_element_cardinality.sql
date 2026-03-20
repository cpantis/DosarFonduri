-- Add cardinality columns to element_definitions
-- Supports elements like "3 oferte de preț" (minCount=3)
ALTER TABLE element_definitions ADD COLUMN IF NOT EXISTS min_count integer NOT NULL DEFAULT 1;
ALTER TABLE element_definitions ADD COLUMN IF NOT EXISTS max_count integer;
