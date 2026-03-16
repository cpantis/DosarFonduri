import { db } from "../db";
import { documents, templateElements, rules, projects, companies, documentFolders } from "../db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Verify a document belongs to the given organization.
 * Returns the document if found, null otherwise.
 */
export async function verifyDocumentOwnership(documentId: string, organizationId: string) {
  return db.query.documents.findFirst({
    where: and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)),
  });
}

/**
 * Verify a template element belongs to the given organization (via its document).
 * Returns the element if found, null otherwise.
 */
export async function verifyTemplateElementOwnership(elementId: string, organizationId: string) {
  return db.query.templateElements.findFirst({
    where: and(eq(templateElements.id, elementId), eq(templateElements.organizationId, organizationId)),
  });
}

/**
 * Verify a rule belongs to the given organization.
 * Returns the rule if found, null otherwise.
 */
export async function verifyRuleOwnership(ruleId: string, organizationId: string) {
  return db.query.rules.findFirst({
    where: and(eq(rules.id, ruleId), eq(rules.organizationId, organizationId)),
  });
}

/**
 * Verify a project belongs to the given organization.
 * Returns the project if found, null otherwise.
 */
export async function verifyProjectOwnership(projectId: string, organizationId: string) {
  return db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)),
  });
}

/**
 * Verify a company belongs to the given organization.
 * Returns the company if found, null otherwise.
 */
export async function verifyCompanyOwnership(companyId: string, organizationId: string) {
  return db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.organizationId, organizationId)),
  });
}

/**
 * Verify a folder belongs to the given organization.
 * Returns the folder if found, null otherwise.
 */
export async function verifyFolderOwnership(folderId: string, organizationId: string) {
  return db.query.documentFolders.findFirst({
    where: and(eq(documentFolders.id, folderId), eq(documentFolders.organizationId, organizationId)),
  });
}
