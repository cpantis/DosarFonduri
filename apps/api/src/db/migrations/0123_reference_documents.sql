-- 0123: Add 'referinte' folder type and 'referinta_strategica' processing type
-- for strategic reference documents (PNIESC, PNRR, regulations, etc.)

ALTER TYPE folder_type ADD VALUE IF NOT EXISTS 'referinte';
ALTER TYPE doc_processing_type ADD VALUE IF NOT EXISTS 'referinta_strategica';
