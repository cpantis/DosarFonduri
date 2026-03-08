-- Add program metadata fields to projects (collected by Solomon, used by Neemia)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS program_finantare VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cod_masura VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cod_sesiune VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cod_nomenclator VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS prefix_documente VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cod_mysmis VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS structura_dosar TEXT;
