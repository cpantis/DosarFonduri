-- 0123: Add 'referinte' folder type, 'referinta_strategica' processing type,
-- and 'reference_extractor' AI agent for strategic reference documents

ALTER TYPE folder_type ADD VALUE IF NOT EXISTS 'referinte';
ALTER TYPE doc_processing_type ADD VALUE IF NOT EXISTS 'referinta_strategica';
ALTER TYPE ai_agent ADD VALUE IF NOT EXISTS 'reference_extractor';
