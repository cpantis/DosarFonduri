-- Migration 0116: DB audit fixes (2026-03-23)
-- Fixes: FK onDelete policies, missing indexes on CASCADE FK columns

-- ═══════════════════════════════════════════════════════════
-- C1-C2: project_elements FK onDelete: NO ACTION → SET NULL
-- Without this, deleting a document (which cascades to templateElements
-- and elementDefinitions) causes FK violation errors.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE "project_elements" DROP CONSTRAINT IF EXISTS "project_elements_template_element_id_template_elements_id_fk";
ALTER TABLE "project_elements" ADD CONSTRAINT "project_elements_template_element_id_template_elements_id_fk"
  FOREIGN KEY ("template_element_id") REFERENCES "template_elements"("id") ON DELETE SET NULL;

ALTER TABLE "project_elements" DROP CONSTRAINT IF EXISTS "project_elements_element_def_id_element_definitions_id_fk";
ALTER TABLE "project_elements" ADD CONSTRAINT "project_elements_element_def_id_element_definitions_id_fk"
  FOREIGN KEY ("element_def_id") REFERENCES "element_definitions"("id") ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════
-- M1-M13: Missing indexes on CASCADE FK columns
-- These FK columns are used in CASCADE deletes or frequent JOINs
-- but have no index, causing sequential scans on delete.
-- ═══════════════════════════════════════════════════════════

-- M1: project_eligibility.project_id (CASCADE from project delete)
CREATE INDEX IF NOT EXISTS "proj_elig_project_idx" ON "project_eligibility" ("project_id");

-- M2: project_documents.project_id (CASCADE from project delete)
CREATE INDEX IF NOT EXISTS "proj_doc_project_idx" ON "project_documents" ("project_id");

-- M3: project_checklist.project_id (CASCADE from project delete)
CREATE INDEX IF NOT EXISTS "proj_check_project_idx" ON "project_checklist" ("project_id");

-- M4: solomon_conversations.project_id (CASCADE from project delete)
CREATE INDEX IF NOT EXISTS "solomon_conv_project_idx" ON "solomon_conversations" ("project_id");

-- M5: rules.document_id (CASCADE from document delete)
CREATE INDEX IF NOT EXISTS "rules_doc_idx" ON "rules" ("document_id");

-- M6: rules.organization_id (frequently filtered)
CREATE INDEX IF NOT EXISTS "rules_org_idx" ON "rules" ("organization_id");

-- M7: template_elements.organization_id (frequently filtered)
CREATE INDEX IF NOT EXISTS "tmpl_el_org_idx" ON "template_elements" ("organization_id");

-- M8: users.organization_id (JOIN at login, filtered in admin)
CREATE INDEX IF NOT EXISTS "users_org_idx" ON "users" ("organization_id");

-- M9: files.organization_id (filtered on cleanup)
CREATE INDEX IF NOT EXISTS "files_org_idx" ON "files" ("organization_id");

-- M10: compose_section_versions.project_document_id (CASCADE)
CREATE INDEX IF NOT EXISTS "csv_projdoc_idx" ON "compose_section_versions" ("project_document_id");

-- M11: company_associates.company_id (CASCADE from company delete)
CREATE INDEX IF NOT EXISTS "comp_assoc_company_idx" ON "company_associates" ("company_id");

-- M12: company_administrators.company_id (CASCADE from company delete)
CREATE INDEX IF NOT EXISTS "comp_admin_company_idx" ON "company_administrators" ("company_id");

-- M13: company_if_members.company_id (CASCADE from company delete)
CREATE INDEX IF NOT EXISTS "comp_ifm_company_idx" ON "company_if_members" ("company_id");

-- Additional: project_eligibility.rule_id (CASCADE from rule delete)
CREATE INDEX IF NOT EXISTS "proj_elig_rule_idx" ON "project_eligibility" ("rule_id");

-- Additional: project_documents.template_document_id (CASCADE from document delete)
CREATE INDEX IF NOT EXISTS "proj_doc_template_idx" ON "project_documents" ("template_document_id");
