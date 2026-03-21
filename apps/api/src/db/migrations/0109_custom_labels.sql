-- Add custom labels for Solomon and Neemia (frontend-only, configurable per org)
ALTER TABLE org_config ADD COLUMN IF NOT EXISTS solomon_label VARCHAR(100) DEFAULT 'Solomon';
ALTER TABLE org_config ADD COLUMN IF NOT EXISTS neemia_label VARCHAR(100) DEFAULT 'Neemia';
