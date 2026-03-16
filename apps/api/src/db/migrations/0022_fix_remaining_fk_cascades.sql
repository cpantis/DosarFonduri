-- Migration 0022: Fix remaining FK cascade drift
-- These FKs have ON DELETE CASCADE in schema.ts but ON DELETE NO ACTION in migration 0000
-- Migration 0017 fixed some cascades but missed these

-- users.organization_id → organizations.id
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_organization_id_organizations_id_fk";
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- files.organization_id → organizations.id
ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "files_organization_id_organizations_id_fk";
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- documents.organization_id → organizations.id
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_organization_id_organizations_id_fk";
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- document_folders.organization_id → organizations.id
ALTER TABLE "document_folders" DROP CONSTRAINT IF EXISTS "document_folders_organization_id_organizations_id_fk";
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- rules.organization_id → organizations.id
ALTER TABLE "rules" DROP CONSTRAINT IF EXISTS "rules_organization_id_organizations_id_fk";
ALTER TABLE "rules" ADD CONSTRAINT "rules_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- template_elements.organization_id → organizations.id
ALTER TABLE "template_elements" DROP CONSTRAINT IF EXISTS "template_elements_organization_id_organizations_id_fk";
ALTER TABLE "template_elements" ADD CONSTRAINT "template_elements_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- projects.organization_id → organizations.id
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_organization_id_organizations_id_fk";
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- project_documents.template_document_id → documents.id (cascade for template doc cleanup)
-- Note: already fixed by 0017, included here as idempotent safety net
ALTER TABLE "project_documents" DROP CONSTRAINT IF EXISTS "project_documents_template_document_id_documents_id_fk";
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_template_document_id_documents_id_fk"
  FOREIGN KEY ("template_document_id") REFERENCES "documents"("id") ON DELETE CASCADE;
