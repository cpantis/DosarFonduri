-- 0111: Fix FK constraints on user_id columns to allow user deletion
-- Changes notNull user_id references to SET NULL so deleting a user
-- doesn't violate FK constraints. Audit trail is preserved with null user_id.

-- audit_log.user_id: make nullable + SET NULL on delete
ALTER TABLE "audit_log" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "audit_log_user_id_users_id_fk";
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- ai_usage_log.user_id: make nullable + SET NULL on delete
ALTER TABLE "ai_usage_log" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "ai_usage_log" DROP CONSTRAINT IF EXISTS "ai_usage_log_user_id_users_id_fk";
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- solomon_conversations.user_id: make nullable + SET NULL on delete
ALTER TABLE "solomon_conversations" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "solomon_conversations" DROP CONSTRAINT IF EXISTS "solomon_conversations_user_id_users_id_fk";
ALTER TABLE "solomon_conversations" ADD CONSTRAINT "solomon_conversations_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- projects.consultant_id: make nullable + SET NULL on delete
ALTER TABLE "projects" ALTER COLUMN "consultant_id" DROP NOT NULL;
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_consultant_id_users_id_fk";
ALTER TABLE "projects" ADD CONSTRAINT "projects_consultant_id_users_id_fk"
  FOREIGN KEY ("consultant_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- projects.locked_by: already nullable, just fix FK
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_locked_by_users_id_fk";
ALTER TABLE "projects" ADD CONSTRAINT "projects_locked_by_users_id_fk"
  FOREIGN KEY ("locked_by") REFERENCES "users"("id") ON DELETE SET NULL;

-- documents does NOT have a created_by column (it has uploaded_by).
-- Lines previously here were a bug — documents.created_by was never created.
-- The uploaded_by FK is already correctly SET NULL via the initial migration.

-- document_folders.created_by: make nullable + SET NULL
ALTER TABLE "document_folders" ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "document_folders" DROP CONSTRAINT IF EXISTS "document_folders_created_by_users_id_fk";
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;

-- companies.uploaded_by: already has SET NULL ✓

-- All other user_id FKs (validated_by, confirmed_by, override_by, etc.)
-- are already nullable, just need ON DELETE SET NULL

ALTER TABLE "rules" DROP CONSTRAINT IF EXISTS "rules_validated_by_users_id_fk";
ALTER TABLE "rules" ADD CONSTRAINT "rules_validated_by_users_id_fk"
  FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "template_elements" DROP CONSTRAINT IF EXISTS "template_elements_validated_by_users_id_fk";
ALTER TABLE "template_elements" ADD CONSTRAINT "template_elements_validated_by_users_id_fk"
  FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "template_placeholder_mapping" DROP CONSTRAINT IF EXISTS "template_placeholder_mapping_validated_by_users_id_fk";
ALTER TABLE "template_placeholder_mapping" ADD CONSTRAINT "template_placeholder_mapping_validated_by_users_id_fk"
  FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "guide_reference_tables" DROP CONSTRAINT IF EXISTS "guide_reference_tables_validated_by_users_id_fk";
ALTER TABLE "guide_reference_tables" ADD CONSTRAINT "guide_reference_tables_validated_by_users_id_fk"
  FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "project_elements" DROP CONSTRAINT IF EXISTS "project_elements_confirmed_by_users_id_fk";
ALTER TABLE "project_elements" ADD CONSTRAINT "project_elements_confirmed_by_users_id_fk"
  FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "project_eligibility" DROP CONSTRAINT IF EXISTS "project_eligibility_override_by_users_id_fk";
ALTER TABLE "project_eligibility" ADD CONSTRAINT "project_eligibility_override_by_users_id_fk"
  FOREIGN KEY ("override_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "project_documents" DROP CONSTRAINT IF EXISTS "project_documents_generated_by_users_id_fk";
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_generated_by_users_id_fk"
  FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "project_documents" DROP CONSTRAINT IF EXISTS "project_documents_validated_by_users_id_fk";
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_validated_by_users_id_fk"
  FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "compose_section_versions" DROP CONSTRAINT IF EXISTS "compose_section_versions_edited_by_users_id_fk";
ALTER TABLE "compose_section_versions" ADD CONSTRAINT "compose_section_versions_edited_by_users_id_fk"
  FOREIGN KEY ("edited_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "element_audit_log" DROP CONSTRAINT IF EXISTS "element_audit_log_changed_by_users_id_fk";
ALTER TABLE "element_audit_log" ADD CONSTRAINT "element_audit_log_changed_by_users_id_fk"
  FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "scoring_criteria" DROP CONSTRAINT IF EXISTS "scoring_criteria_uploaded_by_users_id_fk";
DO $$ BEGIN
  ALTER TABLE "scoring_criteria" ADD CONSTRAINT "scoring_criteria_uploaded_by_users_id_fk"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

ALTER TABLE "solomon_knowledge" DROP CONSTRAINT IF EXISTS "solomon_knowledge_created_by_users_id_fk";
DO $$ BEGIN
  ALTER TABLE "solomon_knowledge" ADD CONSTRAINT "solomon_knowledge_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
