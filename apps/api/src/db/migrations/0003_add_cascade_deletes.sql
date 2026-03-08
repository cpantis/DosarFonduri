-- Add cascade deletes for structural relationships

-- projects.company_id → ON DELETE CASCADE
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_company_id_companies_id_fk";
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE;

-- projects.folder_id → ON DELETE CASCADE
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_folder_id_document_folders_id_fk";
ALTER TABLE "projects" ADD CONSTRAINT "projects_folder_id_document_folders_id_fk"
  FOREIGN KEY ("folder_id") REFERENCES "document_folders"("id") ON DELETE CASCADE;

-- document_folders.parent_id → self-referencing ON DELETE CASCADE
ALTER TABLE "document_folders" DROP CONSTRAINT IF EXISTS "document_folders_parent_id_document_folders_id_fk";
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_parent_id_document_folders_id_fk"
  FOREIGN KEY ("parent_id") REFERENCES "document_folders"("id") ON DELETE CASCADE;

-- ai_usage_log.project_id → ON DELETE SET NULL (preserve logs)
ALTER TABLE "ai_usage_log" DROP CONSTRAINT IF EXISTS "ai_usage_log_project_id_projects_id_fk";
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL;

-- ai_usage_log.user_id → ON DELETE SET NULL (preserve logs)
ALTER TABLE "ai_usage_log" DROP CONSTRAINT IF EXISTS "ai_usage_log_user_id_users_id_fk";
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
