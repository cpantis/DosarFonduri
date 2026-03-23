-- 0114: Fix ALL remaining FK constraints referencing users(id) that still have ON DELETE NO ACTION
-- This is a comprehensive fix to ensure user deletion never fails due to FK violations.
-- All user references should be ON DELETE SET NULL (preserve audit trail, allow deletion).

-- documents.uploaded_by → SET NULL
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_uploaded_by_users_id_fk";
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk"
  FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL;

-- files.uploaded_by → SET NULL
ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "files_uploaded_by_users_id_fk";
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk"
  FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL;
