-- Add ON DELETE CASCADE to FK constraints that were missing it
-- This prevents orphaned records when organizations, guides, or templates are deleted

-- companies.organization_id → organizations.id
ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_organization_id_organizations_id_fk";
ALTER TABLE "companies" ADD CONSTRAINT "companies_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- project_eligibility.rule_id → rules.id
ALTER TABLE "project_eligibility" DROP CONSTRAINT IF EXISTS "project_eligibility_rule_id_rules_id_fk";
ALTER TABLE "project_eligibility" ADD CONSTRAINT "project_eligibility_rule_id_rules_id_fk"
  FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE CASCADE;

-- project_documents.template_document_id → documents.id
ALTER TABLE "project_documents" DROP CONSTRAINT IF EXISTS "project_documents_template_document_id_documents_id_fk";
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_template_document_id_documents_id_fk"
  FOREIGN KEY ("template_document_id") REFERENCES "documents"("id") ON DELETE CASCADE;

-- project_checklist.template_id → documents.id
ALTER TABLE "project_checklist" DROP CONSTRAINT IF EXISTS "project_checklist_template_id_documents_id_fk";
ALTER TABLE "project_checklist" ADD CONSTRAINT "project_checklist_template_id_documents_id_fk"
  FOREIGN KEY ("template_id") REFERENCES "documents"("id") ON DELETE CASCADE;

-- solomon_knowledge.organization_id → organizations.id
ALTER TABLE "solomon_knowledge" DROP CONSTRAINT IF EXISTS "solomon_knowledge_organization_id_organizations_id_fk";
ALTER TABLE "solomon_knowledge" ADD CONSTRAINT "solomon_knowledge_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- api_integrations.organization_id → organizations.id
ALTER TABLE "api_integrations" DROP CONSTRAINT IF EXISTS "api_integrations_organization_id_organizations_id_fk";
ALTER TABLE "api_integrations" ADD CONSTRAINT "api_integrations_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- org_config.organization_id → organizations.id
ALTER TABLE "org_config" DROP CONSTRAINT IF EXISTS "org_config_organization_id_organizations_id_fk";
ALTER TABLE "org_config" ADD CONSTRAINT "org_config_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- ai_usage_log.organization_id → organizations.id
ALTER TABLE "ai_usage_log" DROP CONSTRAINT IF EXISTS "ai_usage_log_organization_id_organizations_id_fk";
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- audit_log.organization_id → organizations.id
ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "audit_log_organization_id_organizations_id_fk";
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- element_rule_links: at least one of template_element_id or element_def_id must be non-null
ALTER TABLE "element_rule_links" DROP CONSTRAINT IF EXISTS "erl_at_least_one_element_ref";
ALTER TABLE "element_rule_links" ADD CONSTRAINT "erl_at_least_one_element_ref"
  CHECK ("template_element_id" IS NOT NULL OR "element_def_id" IS NOT NULL);
