-- Migration 0020: Upgrade files.size from integer to bigint
-- Supports files larger than 2GB (integer max = 2,147,483,647 bytes ≈ 2.1 GB)
ALTER TABLE "files" ALTER COLUMN "size" SET DATA TYPE bigint;
