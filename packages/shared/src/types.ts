export type Plan = "starter" | "professional" | "enterprise";
export type OrgStatus = "active" | "trial" | "inactive" | "expired";
export type UserRole = "admin" | "consultant" | "viewer";
export type UserStatus = "active" | "invited" | "disabled" | "pending_cabinet";
export type Theme = "dark" | "light";
export type FormaJuridica = "SRL" | "SA" | "SNC" | "SCS" | "SCA" | "PFA" | "II" | "IF" | "SC" | "RA" | "SA_BVB";
export type CompanyStatus = "functiune" | "radiata" | "dizolvata" | "lichidare";
export type FolderType = "program" | "masura" | "sesiune" | "ghiduri" | "templateuri" | "clienti_prospecti" | "clienti_finali";
export type DocFileType = "pdf" | "docx" | "xlsx" | "doc" | "png" | "jpg";
export type DocStatus = "uploaded" | "processing" | "processed" | "error" | "failed";
export type DocProcessingType = "ghid" | "template" | "reference" | "client_doc" | "reference_data";
export type RuleType = "fixed" | "interpreted";
export type FieldType = "text" | "number" | "textarea" | "date" | "table" | "signature" | "select";
export type ProjectStatus = "draft" | "in_progress" | "review" | "submitted" | "approved" | "rejected";
export type EligibilityStatus = "passed" | "failed" | "pending" | "not_applicable";
export type ElementSource = "onrc" | "solomon" | "manual" | "calculated" | "ghid" | "document_extracted" | "onrc_auto" | "anaf_auto" | "solomon_chat" | "consultant_manual" | "derived";
export type MessageRole = "user" | "assistant" | "system";
export type AiAgent = "solomon" | "neemia" | "ghid_rules" | "ocr";
export type AssociateType = "pf" | "pj";
export type FinancialSource = "onrc" | "anaf_upload";
export type GeneratedDocStatus = "generating" | "generated" | "validated" | "error";
export type GenerationMode = "fill" | "compose";
export type GenerationContext = "work" | "submission";
export type RefTableType = "lookup" | "classification" | "list" | "matrix";
export type RefExtractedBy = "ai" | "manual";
export type RefUsage = "validates" | "scores" | "classifies";
export type ElementRoleLink = "input" | "output" | "constraint";
export type ElementCategory = "beneficiary" | "farm" | "investment" | "location" | "financial" | "legal" | "technical" | "other";
export type ElementDataType = "number" | "text" | "enum" | "boolean" | "date" | "document_ref" | "list_items";
export type PlaceholderMappedBy = "auto" | "manual";
export type ValidationStatus = "pending" | "valid" | "warning" | "invalid";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  theme: Theme;
  organizationId: string | null;
  status: UserStatus;
}

export interface Organization {
  id: string;
  name: string;
  code: string;
  plan: Plan;
  maxUsers: number;
  status: OrgStatus;
  trialEndsAt: string | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  organization?: Organization;
  hasOrganization: boolean;
}

export interface ApiError {
  error: string;
}
