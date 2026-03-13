-- Add 'reference_data' to doc_processing_type enum
-- This value is used when uploading reference data files (UAT lists, correlation tables)
-- into ghiduri folders with explicit processing_type=reference_data
ALTER TYPE doc_processing_type ADD VALUE IF NOT EXISTS 'reference_data';
