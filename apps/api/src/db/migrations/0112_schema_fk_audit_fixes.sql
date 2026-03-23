-- Migration 0112: Schema FK audit fixes
-- Fixes missing onDelete policies, missing FK references, and adds session_checklist.done column

-- #1: Add 'done' column to session_checklist
ALTER TABLE "session_checklist" ADD COLUMN IF NOT EXISTS "done" boolean NOT NULL DEFAULT false;

-- #2: documents.file_id — add ON DELETE CASCADE (document useless without file)
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_file_id_files_id_fk";
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_id_files_id_fk"
  FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE;

-- #3: company_financials.file_id — add ON DELETE SET NULL
ALTER TABLE "company_financials" DROP CONSTRAINT IF EXISTS "company_financials_file_id_files_id_fk";
ALTER TABLE "company_financials" ADD CONSTRAINT "company_financials_file_id_files_id_fk"
  FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL;

-- #4: companies.certificat_file_id — add ON DELETE SET NULL
ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_certificat_file_id_files_id_fk";
ALTER TABLE "companies" ADD CONSTRAINT "companies_certificat_file_id_files_id_fk"
  FOREIGN KEY ("certificat_file_id") REFERENCES "files"("id") ON DELETE SET NULL;

-- #5: project_documents.generated_file_id — add ON DELETE SET NULL
ALTER TABLE "project_documents" DROP CONSTRAINT IF EXISTS "project_documents_generated_file_id_files_id_fk";
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_generated_file_id_files_id_fk"
  FOREIGN KEY ("generated_file_id") REFERENCES "files"("id") ON DELETE SET NULL;

-- #6: project_elements.source_document_id — add ON DELETE SET NULL
ALTER TABLE "project_elements" DROP CONSTRAINT IF EXISTS "project_elements_source_document_id_documents_id_fk";
ALTER TABLE "project_elements" ADD CONSTRAINT "project_elements_source_document_id_documents_id_fk"
  FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE SET NULL;

-- #7: element_definitions.lookup_table_id — add FK to guide_reference_tables
ALTER TABLE "element_definitions" ADD CONSTRAINT "element_definitions_lookup_table_id_guide_reference_tables_id_fk"
  FOREIGN KEY ("lookup_table_id") REFERENCES "guide_reference_tables"("id") ON DELETE SET NULL;

-- #8: cabinet_codes.organization_id — add ON DELETE SET NULL
ALTER TABLE "cabinet_codes" DROP CONSTRAINT IF EXISTS "cabinet_codes_organization_id_organizations_id_fk";
ALTER TABLE "cabinet_codes" ADD CONSTRAINT "cabinet_codes_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL;

-- #9: users.invited_by — add FK to users(id) ON DELETE SET NULL
ALTER TABLE "users" ADD CONSTRAINT "users_invited_by_users_id_fk"
  FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL;

-- #13: cabinet_codes.created_by — add ON DELETE CASCADE (codes belong to provider user)
ALTER TABLE "cabinet_codes" DROP CONSTRAINT IF EXISTS "cabinet_codes_created_by_provider_users_id_fk";
ALTER TABLE "cabinet_codes" ADD CONSTRAINT "cabinet_codes_created_by_provider_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "provider_users"("id") ON DELETE CASCADE;
