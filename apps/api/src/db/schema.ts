import { pgTable, uuid, varchar, text, integer, bigint, decimal, boolean, timestamp, pgEnum, jsonb, uniqueIndex, index, customType } from "drizzle-orm/pg-core";

/** Custom type for pgvector vector columns — parameterized by dimension */
function vectorType(dimensions: number) {
  return customType<{ data: number[]; driverData: string }>({
    dataType() { return `vector(${dimensions})`; },
    toDriver(value: number[]): string { return `[${value.join(",")}]`; },
    fromDriver(value: string): number[] {
      if (typeof value === "string") {
        return value.replace(/[\[\]]/g, "").split(",").map(Number);
      }
      return value as any;
    },
  });
}

/** OpenAI text-embedding-3-small (1536 dims) — used by guideChunks & solomonKnowledge */
const vector1536 = vectorType(1536);

/** Voyage voyage-context-3 (1024 dims) — used by RAG v2 chunks */
const vector1024 = vectorType(1024);

// === ENUMS ===
export const planEnum = pgEnum("plan", ["starter", "professional", "enterprise"]);
export const orgStatusEnum = pgEnum("org_status", ["active", "trial", "inactive", "expired"]);
export const userRoleEnum = pgEnum("user_role", ["admin", "consultant", "viewer"]);
export const userStatusEnum = pgEnum("user_status", ["active", "invited", "disabled", "pending_cabinet"]);
export const themeEnum = pgEnum("theme", ["dark", "light"]);
export const formaJuridicaEnum = pgEnum("forma_juridica", ["SRL", "SA", "SNC", "SCS", "SCA", "PFA", "II", "IF", "SC", "RA", "SA_BVB"]);
export const companyStatusEnum = pgEnum("company_status", ["functiune", "radiata", "dizolvata", "lichidare"]);
export const folderTypeEnum = pgEnum("folder_type", ["program", "masura", "sesiune", "ghiduri", "templateuri", "clienti_prospecti", "clienti_finali", "referinte"]);
export const docFileTypeEnum = pgEnum("doc_file_type", ["pdf", "docx", "xlsx", "doc", "png", "jpg"]);
export const docStatusEnum = pgEnum("doc_status", ["uploaded", "processing", "processed", "error", "failed"]);
export const docProcessingTypeEnum = pgEnum("doc_processing_type", ["ghid", "template", "reference", "client_doc", "reference_data", "referinta_strategica"]);
export const ruleTypeEnum = pgEnum("rule_type", ["fixed", "interpreted"]);
export const fieldTypeEnum = pgEnum("field_type", ["text", "number", "textarea", "date", "table", "signature", "select"]);
export const refTableTypeEnum = pgEnum("ref_table_type", ["lookup", "classification", "list", "matrix"]);
export const refExtractedByEnum = pgEnum("ref_extracted_by", ["ai", "manual"]);
export const refUsageEnum = pgEnum("ref_usage", ["validates", "scores", "classifies"]);
export const elementRoleLinkEnum = pgEnum("element_role_link", ["input", "output", "constraint"]);
export const projectStatusEnum = pgEnum("project_status", ["draft", "in_progress", "review", "submitted", "approved", "rejected"]);
export const eligibilityStatusEnum = pgEnum("eligibility_status", ["passed", "failed", "pending", "not_applicable"]);
export const elementSourceEnum = pgEnum("element_source", ["onrc", "solomon", "manual", "calculated", "ghid", "document_extracted", "onrc_auto", "anaf_auto", "solomon_chat", "consultant_manual", "derived"]);
export const elementCategoryEnum = pgEnum("element_category", ["beneficiary", "farm", "investment", "location", "financial", "legal", "technical", "other"]);
export const elementDataTypeEnum = pgEnum("element_data_type", ["number", "text", "enum", "boolean", "date", "document_ref", "list_items"]);
export const placeholderMappedByEnum = pgEnum("placeholder_mapped_by", ["auto", "manual", "ai"]);
export const validationStatusEnum = pgEnum("validation_status", ["pending", "valid", "warning", "invalid"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);
export const aiAgentEnum = pgEnum("ai_agent", ["solomon", "neemia", "ghid_rules", "ocr", "template_mapping", "reference_extractor"]);
export const associateTypeEnum = pgEnum("associate_type", ["pf", "pj"]);
export const financialSourceEnum = pgEnum("financial_source", ["onrc", "anaf_upload"]);
export const generatedDocStatusEnum = pgEnum("generated_doc_status", ["generating", "generated", "validated", "error"]);
export const generationModeEnum = pgEnum("generation_mode", ["fill", "compose"]);
export const generationContextEnum = pgEnum("generation_context", ["work", "submission"]);
export const documentTypeEnum = pgEnum("document_type_class", [
  "guide", "guide_annex_table", "guide_annex_form",
  "certificat_constatator", "bilant_anaf", "contract_arenda",
  "oferta_pret", "registru_imobilizari", "declaratie_expert_contabil",
  "document_mediu", "extras_cont", "certificat_fiscal",
  "memoriu_template", "cerere_finantare_template",
  "anexa_b_template", "anexa_c_template",
  "carte_identitate", "diploma_studii", "act_constitutiv", "factura",
  "statut", "descriere_proiect", "adeverinta", "foto_echipament",
  "other",
]);

// === ORGANIZATIONS ===
export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  plan: planEnum("plan").notNull().default("starter"),
  maxUsers: integer("max_users").notNull().default(1),
  trialEndsAt: timestamp("trial_ends_at"),
  status: orgStatusEnum("status").notNull().default("trial"),
  providerNotes: text("provider_notes"),
  cabinetDocumentStyle: jsonb("cabinet_document_style").$type<{
    primaryColor?: string;      // header-e tabele, titluri (default: #1a3a5c)
    accentColor?: string;       // highlight rând activ, badge CONFORM
    fontFamily?: string;        // font document (default: DM Sans)
    logoUrl?: string;           // URL logo cabinet (presigned or stored)
    footerText?: string;        // text footer cabinet
    highlightColor?: string;    // rândul activ din lookup tables
    warningColor?: string;      // badge-uri atenție
    logoOnWorkDocs?: boolean;   // logo pe documente de lucru (default: true)
    logoOnFinalDocs?: boolean;  // logo pe documente finale (default: false)
    numberFormat?: "ro" | "en"; // format numere: ro = 2.500.000, en = 2,500,000 (default: ro)
    draftWatermark?: boolean;   // watermark "DRAFT" pe documente de lucru (default: true)
    draftWatermarkText?: string; // text watermark custom (default: "DRAFT")
  }>(),
  folderLockedBy: uuid("folder_locked_by").references((): any => users.id, { onDelete: "set null" }),
  folderLockedAt: timestamp("folder_locked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

// === USERS ===
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("consultant"),
  theme: themeEnum("theme").notNull().default("dark"),
  status: userStatusEnum("status").notNull().default("pending_cabinet"),
  invitedBy: uuid("invited_by").references((): any => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at"),
}, (table) => ({
  orgIdx: index("users_org_idx").on(table.organizationId),
}));

// === FILES (centralized storage) ===
export const files = pgTable("files", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  storageKey: varchar("storage_key", { length: 500 }).notNull(),
  originalName: varchar("original_name", { length: 500 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("files_org_idx").on(table.organizationId),
}));

// === COMPANIES ===
export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  formaJuridica: formaJuridicaEnum("forma_juridica").notNull(),
  denumire: varchar("denumire", { length: 500 }).notNull(),
  cui: varchar("cui", { length: 20 }).notNull(),
  regCom: varchar("reg_com", { length: 30 }),
  euid: varchar("euid", { length: 50 }),
  adresa: text("adresa"),
  localitate: varchar("localitate", { length: 100 }),
  judet: varchar("judet", { length: 50 }),
  codPostal: varchar("cod_postal", { length: 10 }),
  telefon: varchar("telefon", { length: 50 }),
  email: varchar("email", { length: 255 }),
  website: varchar("website", { length: 255 }),
  caen: varchar("caen", { length: 10 }),
  stare: companyStatusEnum("stare").notNull().default("functiune"),
  durata: varchar("durata", { length: 50 }),
  anInfiintare: integer("an_infiintare"),
  capitalSocial: decimal("capital_social", { precision: 15, scale: 2 }),
  moneda: varchar("moneda", { length: 10 }),
  partiSociale: integer("parti_sociale"),
  actiuni: integer("actiuni"),
  valoareParte: decimal("valoare_parte", { precision: 15, scale: 2 }),
  valoareActiune: decimal("valoare_actiune", { precision: 15, scale: 2 }),
  naturaCapital: jsonb("natura_capital"),
  patrimoniu_afectat: text("patrimoniu_afectat"),
  reprezentantIF: varchar("reprezentant_if", { length: 255 }),
  onrcRawData: jsonb("onrc_raw_data"),
  certificatFileId: uuid("certificat_file_id").references(() => files.id, { onDelete: "set null" }),
  processingStatus: varchar("processing_status", { length: 20 }).default("idle"),
  processingError: text("processing_error"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
}, (table) => ({
  cuiOrgIdx: uniqueIndex("cui_org_idx").on(table.cui, table.organizationId),
  orgIdx: index("company_org_idx").on(table.organizationId),
}));

// === COMPANY ASSOCIATES ===
export const companyAssociates = pgTable("company_associates", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  type: associateTypeEnum("type").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 100 }),
  citizenshipOrCountry: varchar("citizenship_country", { length: 100 }),
  contribution: decimal("contribution", { precision: 15, scale: 2 }),
  shares: integer("shares"),
  pctBenefits: decimal("pct_benefits", { precision: 5, scale: 2 }),
  pctLosses: decimal("pct_losses", { precision: 5, scale: 2 }),
  tipAsociat: varchar("tip_asociat", { length: 50 }),
}, (table) => ({
  companyIdx: index("comp_assoc_company_idx").on(table.companyId),
}));

// === COMPANY ADMINISTRATORS ===
export const companyAdministrators = pgTable("company_administrators", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 100 }),
  powers: varchar("powers", { length: 255 }),
  mandateDuration: varchar("mandate_duration", { length: 50 }),
  appointmentDate: varchar("appointment_date", { length: 20 }),
}, (table) => ({
  companyIdx: index("comp_admin_company_idx").on(table.companyId),
}));

// === COMPANY LINKED COMPANIES (firme legate) ===
export const companyLinkedCompanies = pgTable("company_linked_companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  // Linked company data
  linkedCui: varchar("linked_cui", { length: 20 }).notNull(),
  linkedName: varchar("linked_name", { length: 500 }).notNull(),
  linkedStatus: varchar("linked_status", { length: 100 }),
  linkedNace: varchar("linked_nace", { length: 20 }),
  linkedNaceDescription: varchar("linked_nace_description", { length: 500 }),
  linkedCounty: varchar("linked_county", { length: 100 }),
  linkedTurnover: decimal("linked_turnover", { precision: 15, scale: 2 }),
  linkedProfit: decimal("linked_profit", { precision: 15, scale: 2 }),
  linkedEmployees: integer("linked_employees"),
  // Connection details
  personName: varchar("person_name", { length: 255 }).notNull(),
  personRoleMain: varchar("person_role_main", { length: 100 }), // role in main company
  personSharesMain: decimal("person_shares_main", { precision: 5, scale: 2 }), // % in main company
  personRoleLinked: varchar("person_role_linked", { length: 100 }), // role in linked company
  personSharesLinked: decimal("person_shares_linked", { precision: 5, scale: 2 }), // % in linked company
  // Risk assessment
  riskScore: integer("risk_score").notNull().default(0),
  riskFlags: jsonb("risk_flags").$type<string[]>().default([]),
  // Source
  source: varchar("source", { length: 50 }).notNull().default("listafirme"), // listafirme | manual
  confirmed: boolean("confirmed").default(false), // consultant confirmed same person
  dismissed: boolean("dismissed").default(false), // consultant said NOT same person
  notes: text("notes"), // consultant notes
  // Timestamps
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  companyIdx: index("linked_company_idx").on(table.companyId),
  orgIdx: index("linked_org_idx").on(table.organizationId),
  linkedCuiIdx: index("linked_cui_idx").on(table.linkedCui),
}));

// === COMPANY FINANCIALS ===
export const companyFinancials = pgTable("company_financials", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  year: integer("year").notNull(),
  source: financialSourceEnum("source").notNull(),
  fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
  f10: jsonb("f10"),
  f20: jsonb("f20"),
  f30: jsonb("f30"),
  f40: jsonb("f40"),
  processedAt: timestamp("processed_at"),
}, (table) => ({
  companyYearIdx: uniqueIndex("company_year_idx").on(table.companyId, table.year),
}));

// === COMPANY IF MEMBERS ===
export const companyIfMembers = pgTable("company_if_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 100 }),
  kinship: varchar("kinship", { length: 100 }),
  citizenship: varchar("citizenship", { length: 100 }),
  birthDate: varchar("birth_date", { length: 20 }),
}, (table) => ({
  companyIdx: index("comp_ifm_company_idx").on(table.companyId),
}));

// === COMPANY ELEMENTS (materialized key/value from ONRC + financials) ===
export const companyElements = pgTable("company_elements", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  elementKey: varchar("element_key", { length: 255 }).notNull(),
  value: text("value"),
  source: elementSourceEnum("source").notNull().default("onrc"),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  companyIdx: index("comp_el_company_idx").on(table.companyId),
  orgIdx: index("comp_el_org_idx").on(table.organizationId),
  keyCompanyIdx: uniqueIndex("comp_el_key_company_idx").on(table.elementKey, table.companyId),
}));

// === DOCUMENT FOLDERS (tree) ===
export const documentFolders = pgTable("document_folders", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  parentId: uuid("parent_id").references((): any => documentFolders.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: folderTypeEnum("type").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
}, (table) => ({
  orgIdx: index("folder_org_idx").on(table.organizationId),
  parentIdx: index("folder_parent_idx").on(table.parentId),
}));

// === DOCUMENTS ===
export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  folderId: uuid("folder_id").references(() => documentFolders.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  fileType: docFileTypeEnum("file_type").notNull(),
  fileId: uuid("file_id").references(() => files.id, { onDelete: "cascade" }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  fileSize: integer("file_size").notNull(),
  fileHash: varchar("file_hash", { length: 64 }),
  pageCount: integer("page_count").default(0),
  status: docStatusEnum("status").notNull().default("uploaded"),
  processingType: docProcessingTypeEnum("processing_type"),
  generationMode: generationModeEnum("generation_mode").default("fill"),
  composeConfig: jsonb("compose_config").$type<{
    sections: Array<{
      marker: string;          // e.g. "COMPOSE:descriere_proiect" or "TABLE:plan_investitii"
      type: "narrative" | "table" | "calculation";
      label: string;           // human-readable section name
      referenceTableIds?: string[];  // guide_reference_tables to feed this section
      elementKeys?: string[];  // project_element keys relevant to this section
      instructions?: string;   // AI prompt instructions specific to this section
    }>;
    aiModel?: string;          // override org default for this template
    language?: string;         // "ro" default
  }>(),
  blueprint: jsonb("blueprint").$type<{
    templateId: string;
    documentPurpose: string;
    evaluatorExpectations: string;
    generatedAt: string;
    generatedBy: string;
    sections: Array<{
      sectionId: string;
      title: string;
      purpose: string;
      requiredElementKeys: string[];
      optionalElementKeys: string[];
      referenceTableIds: string[];
      tone: "formal" | "technical" | "narrative";
      targetLength: { min: number; max: number };
      keywords: string[];
      evaluatorChecklist: string[];
      structureHint?: string;
      forbiddenPhrases?: string[];
    }>;
  }>(),
  documentTypeClass: documentTypeEnum("document_type_class"),
  classificationConfidence: decimal("classification_confidence", { precision: 3, scale: 2 }),
  processingResult: jsonb("processing_result").$type<{
    document_type: string;
    extracted_fields: Array<{
      field_key: string;
      field_value: any;
      confidence: number;
      source_page: number | null;
      extraction_method: string;
    }>;
    raw_text: string;
    processing_time_ms: number;
  } | Record<string, unknown>>(),
  tags: text("tags").array(),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  processingError: text("processing_error"),
  // RAG v2: AI classification result from document ingestion pipeline
  classification: jsonb("classification").$type<{
    docType: string;        // 'ghid' | 'cerere_finantare' | 'anexa' | 'fisa_evaluare' | 'template_fill' | 'template_compose' | 'document_client' | 'oferta' | 'certificat' | 'studiu_fezabilitate' | 'altul'
    routingAction: string;  // 'vectorize' | 'template_fill' | 'template_compose' | 'extract_data' | 'vectorize_and_extract'
    confidence: number;
    description: string;
    detectedProgram?: string;
    isProcessed?: boolean;
    processedAt?: string;
    chunksCount?: number;
    extractedFields?: number;
  }>(),
  trustScore: decimal("trust_score", { precision: 3, scale: 2 }),
  completenessReport: jsonb("completeness_report").$type<{
    trustScore: number;
    categoriesFound: string[];
    categoriesMissing: string[];
    rulesNeedingReview: number;
    sectionsWithoutRules: string[];
    warnings: string[];
  }>(),
  // RAG v2: Document versioning
  documentVersion: integer("document_version").default(1),
  supersededBy: uuid("superseded_by"),        // documentId of newer version (NULL = current)
  supersedes: uuid("supersedes"),              // documentId of older version (NULL = first)
  isCurrentVersion: boolean("is_current_version").default(true),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  versionDiff: jsonb("version_diff").$type<{
    summary: string;
    changes: Array<{
      type: "added" | "removed" | "modified";
      category: string;
      description: string;
      severity: "critical" | "important" | "minor";
      affectedElements: string[];
    }>;
    analyzedAt: string;
    confidence: number;
  }>(),
}, (table) => ({
  orgIdx: index("doc_org_idx").on(table.organizationId),
  folderIdx: index("doc_folder_idx").on(table.folderId),
}));

// === RULES (from guides) ===
export const rules = pgTable("rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  type: ruleTypeEnum("type").notNull(),
  ruleKey: varchar("rule_key", { length: 255 }),
  category: varchar("category", { length: 100 }),
  description: text("description").notNull(),
  condition: jsonb("condition"),
  sourcePage: integer("source_page"),
  sourceText: text("source_text"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  needsReview: boolean("needs_review").notNull().default(false),
  validated: boolean("validated").notNull().default(false),
  validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
  validatedAt: timestamp("validated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  docIdx: index("rules_doc_idx").on(table.documentId),
  orgIdx: index("rules_org_idx").on(table.organizationId),
}));

// === ELEMENT DEFINITIONS (canonical field definitions from guide processing) ===
// This is the source of truth for what data elements exist per guide.
// project_elements link to this instead of template_elements.
// Templates map placeholders to these via template_placeholder_mapping.
export const elementDefinitions = pgTable("element_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  guideDocumentId: uuid("guide_document_id").references(() => documents.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  elementKey: varchar("element_key", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 500 }).notNull(),
  category: elementCategoryEnum("category").notNull().default("other"),
  dataType: elementDataTypeEnum("data_type").notNull().default("text"),
  unit: varchar("unit", { length: 50 }),
  enumValues: jsonb("enum_values").$type<string[]>(),
  sourcePriority: jsonb("source_priority").$type<string[]>().default(["document_extracted", "solomon_chat", "consultant_manual"]),
  validationRules: jsonb("validation_rules").$type<{
    min?: number;
    max?: number;
    pattern?: string;
    required?: boolean;
    lookupTableId?: string;
    lookupColumn?: string;
    crossCheck?: Array<{ elementKey: string; condition: string }>;
  }>(),
  usedByRules: jsonb("used_by_rules").$type<string[]>(),
  usedInTemplates: jsonb("used_in_templates").$type<string[]>(),
  lookupTableId: uuid("lookup_table_id").references(() => guideReferenceTables.id, { onDelete: "set null" }),
  collectionOrder: integer("collection_order").default(0),
  required: boolean("required").notNull().default(false),
  minCount: integer("min_count").notNull().default(1),
  maxCount: integer("max_count"),
  helpText: text("help_text"),
  isDerived: boolean("is_derived").notNull().default(false),
  derivationFormula: text("derivation_formula"),
  // Solomon Workflow v3 — element taxonomy
  elementType: varchar("element_type", { length: 20 }).notNull().default("scalar"),
  groupKey: varchar("group_key", { length: 100 }),
  parentGroupKey: varchar("parent_group_key", { length: 100 }),
  phase: integer("phase"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  guideIdx: index("elem_def_guide_idx").on(table.guideDocumentId),
  orgIdx: index("elem_def_org_idx").on(table.organizationId),
  keyGuideIdx: uniqueIndex("elem_def_key_guide_idx").on(table.elementKey, table.guideDocumentId),
  phaseIdx: index("elem_def_phase_idx").on(table.phase),
  groupIdx: index("elem_def_group_idx").on(table.groupKey),
  typeIdx: index("elem_def_type_idx").on(table.elementType),
}));

// === GUIDE REFERENCE TABLES (structured data from annexes) ===
export const guideReferenceTables = pgTable("guide_reference_tables", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  description: text("description"),
  tableType: refTableTypeEnum("table_type").notNull(),
  schema: jsonb("schema").$type<Array<{ key: string; label: string; type: string }>>(),
  data: jsonb("data").$type<Array<Record<string, any>>>(),
  lookupKey: varchar("lookup_key", { length: 100 }),
  sourcePage: integer("source_page"),
  sourceText: text("source_text"),
  extractedBy: refExtractedByEnum("extracted_by").notNull().default("ai"),
  validated: boolean("validated").notNull().default(false),
  validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
  validatedAt: timestamp("validated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  docIdx: index("ref_table_doc_idx").on(table.documentId),
  orgIdx: index("ref_table_org_idx").on(table.organizationId),
}));

// === RULE ↔ REFERENCE TABLE LINKS ===
export const ruleReferenceLinks = pgTable("rule_reference_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  ruleId: uuid("rule_id").references(() => rules.id, { onDelete: "cascade" }).notNull(),
  referenceTableId: uuid("reference_table_id").references(() => guideReferenceTables.id, { onDelete: "cascade" }).notNull(),
  usage: refUsageEnum("usage").notNull(),
  description: text("description"),
}, (table) => ({
  ruleIdx: index("rule_ref_rule_idx").on(table.ruleId),
  tableIdx: index("rule_ref_table_idx").on(table.referenceTableId),
}));

// === TEMPLATE ↔ ELEMENT DEFINITION MAPPING (for Neemia output) ===
// Links template placeholders (e.g. {{suprafata}}) to canonical element_definitions.
// This decouples templates from being the source of truth for field definitions.
export const templatePlaceholderMapping = pgTable("template_placeholder_mapping", {
  id: uuid("id").defaultRandom().primaryKey(),
  templateDocumentId: uuid("template_document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  placeholderKey: varchar("placeholder_key", { length: 255 }).notNull(),
  elementDefId: uuid("element_def_id").references(() => elementDefinitions.id, { onDelete: "cascade" }).notNull(),
  mappedBy: placeholderMappedByEnum("mapped_by").notNull().default("auto"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  validated: boolean("validated").notNull().default(false),
  validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
  validatedAt: timestamp("validated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  templateIdx: index("tpl_map_template_idx").on(table.templateDocumentId),
  elementIdx: index("tpl_map_element_idx").on(table.elementDefId),
  uniqueMapping: uniqueIndex("tpl_map_unique_idx").on(table.templateDocumentId, table.placeholderKey),
}));

// === ELEMENT ↔ RULE LINKS ===
export const elementRuleLinks = pgTable("element_rule_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  templateElementId: uuid("template_element_id").references(() => templateElements.id, { onDelete: "cascade" }),  // nullable — backward compat
  elementDefId: uuid("element_def_id").references(() => elementDefinitions.id, { onDelete: "cascade" }),  // NEW anchor
  ruleId: uuid("rule_id").references(() => rules.id, { onDelete: "cascade" }).notNull(),
  role: elementRoleLinkEnum("role").notNull(),
  description: text("description"),
}, (table) => ({
  elementIdx: index("elem_rule_elem_idx").on(table.templateElementId),
  elementDefIdx: index("elem_rule_elemdef_idx").on(table.elementDefId),
  ruleIdx: index("elem_rule_rule_idx").on(table.ruleId),
  uniqueRuleElemDef: uniqueIndex("elem_rule_unique_rule_elemdef_idx").on(table.ruleId, table.elementDefId),
}));

// === TEMPLATE ELEMENTS ===
export const templateElements = pgTable("template_elements", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  key: varchar("key", { length: 255 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  fieldType: fieldTypeEnum("field_type").notNull().default("text"),
  pageNum: integer("page_num"),
  lineNum: integer("line_num"),
  group: varchar("group", { length: 50 }),
  isRepeating: boolean("is_repeating").notNull().default(false),
  rowIndex: integer("row_index"),
  detected: boolean("detected").notNull().default(true),
  validated: boolean("validated").notNull().default(false),
  validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  docIdx: index("template_el_doc_idx").on(table.documentId),
  orgIdx: index("tmpl_el_org_idx").on(table.organizationId),
}));

// === PROJECTS ===
export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  folderId: uuid("folder_id").references(() => documentFolders.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  status: projectStatusEnum("status").notNull().default("draft"),
  valoare: decimal("valoare", { precision: 15, scale: 2 }),
  // Program metadata (collected by Solomon, used by Neemia)
  programFinantare: varchar("program_finantare", { length: 255 }),
  codMasura: varchar("cod_masura", { length: 100 }),
  codSesiune: varchar("cod_sesiune", { length: 100 }),
  codNomenclator: varchar("cod_nomenclator", { length: 100 }),
  prefixDocumente: varchar("prefix_documente", { length: 100 }),
  codMysmis: varchar("cod_mysmis", { length: 100 }),
  structuraDosar: text("structura_dosar"),
  tipProiect: varchar("tip_proiect", { length: 50 }),
  temaProiect: varchar("tema_proiect", { length: 255 }),
  // Solomon Workflow v3 — phase tracking
  narrativeThread: jsonb("narrative_thread").$type<{
    problem?: string;
    impact?: string;
    solution?: string;
    context?: string;
    ambition?: string;
  }>(),
  currentPhase: integer("current_phase").default(1),
  currentQuestion: integer("current_question").default(0),
  // RAG v2: Solomon phase tracking (Q0-Q11) — JSONB
  solomonPhase: jsonb("solomon_phase").$type<{
    phase: string;       // 'Q0' | 'Q1' | ... | 'Q11'
    label: string;
    progress: number;    // 0-100
    nextAction: string;
    updatedAt: string;
  }>(),
  // RAG v2: Compose brief generated by Solomon for Neemia
  composeBrief: jsonb("compose_brief").$type<{
    narrativeThread: string;
    clientProfile: { type: string; experience: string; currentAssets: string };
    investmentDescription: { summary: string; objectives: string[]; justification: string };
    eligibilityConclusions: { status: string; keyFindings: string[]; risks: string[] };
    scoringEstimate: { totalPoints: number; keyFactors: string[]; threshold: string };
    strategicArguments: string[];
    generatedAt: string;
  }>(),
  deadline: timestamp("deadline"),
  consultantId: uuid("consultant_id").references(() => users.id, { onDelete: "set null" }),
  lockedBy: uuid("locked_by").references(() => users.id, { onDelete: "set null" }),
  lockedAt: timestamp("locked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  orgIdx: index("project_org_idx").on(table.organizationId),
  companyIdx: index("project_company_idx").on(table.companyId),
}));

// === PROJECT ELEMENTS (field values) ===
export const projectElements = pgTable("project_elements", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  templateElementId: uuid("template_element_id").references(() => templateElements.id, { onDelete: "set null" }),
  elementDefId: uuid("element_def_id").references(() => elementDefinitions.id, { onDelete: "set null" }),
  instanceIndex: integer("instance_index").notNull().default(0),  // For multi-instance elements (minCount>1): 0, 1, 2...
  parentInstanceIndex: integer("parent_instance_index"),  // Links nested group instance to parent
  value: text("value"),
  source: elementSourceEnum("source").notNull().default("manual"),
  sourceDocumentId: uuid("source_document_id").references(() => documents.id, { onDelete: "set null" }),
  confirmed: boolean("confirmed").notNull().default(false),
  confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
  validationStatus: validationStatusEnum("validation_status").notNull().default("pending"),
  validationDetails: jsonb("validation_details").$type<{
    typeCheck?: { passed: boolean; message: string };
    lookupResult?: { tableId: string; tableName: string; matched: boolean; matchedRow?: Record<string, any>; message: string };
    crossChecks?: Array<{ check: string; passed: boolean; message: string }>;
    ruleResults?: Array<{ ruleId: string; ruleText: string; status: string; message: string }>;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  projectIdx: index("proj_el_project_idx").on(table.projectId),
  elementDefIdx: index("proj_el_elemdef_idx").on(table.elementDefId),
}));

// === PROJECT ELIGIBILITY ===
export const projectEligibility = pgTable("project_eligibility", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  ruleId: uuid("rule_id").references(() => rules.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  status: eligibilityStatusEnum("status").notNull().default("pending"),
  autoResult: boolean("auto_result"),
  overrideResult: boolean("override_result"),
  overrideBy: uuid("override_by").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("proj_elig_org_idx").on(table.organizationId),
  projectIdx: index("proj_elig_project_idx").on(table.projectId),
  ruleIdx: index("proj_elig_rule_idx").on(table.ruleId),
}));

// === PROJECT DOCUMENTS (generated by Neemia) ===
export const projectDocuments = pgTable("project_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  templateDocumentId: uuid("template_document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  generatedFileId: uuid("generated_file_id").references(() => files.id, { onDelete: "set null" }),
  status: generatedDocStatusEnum("status").notNull().default("generating"),
  version: integer("version").notNull().default(1),
  pagesCompleted: integer("pages_completed").default(0),
  totalPages: integer("total_pages").default(0),
  filledCount: integer("filled_count"),
  missingCount: integer("missing_count"),
  missingKeys: jsonb("missing_keys").$type<string[]>(),
  generationMode: generationModeEnum("generation_mode").default("fill"),
  generationContext: generationContextEnum("generation_context").default("work"),
  composeContent: jsonb("compose_content").$type<{
    sections: Array<{
      marker: string;
      type: "narrative" | "table" | "calculation";
      label: string;
      content?: string;       // AI-generated narrative text
      tableData?: {           // AI-generated table
        headers: Array<{ key: string; label: string }>;
        rows: Array<Record<string, any>>;
        highlightRows?: number[];
        footerRow?: Record<string, any>;
        caption?: string;
      };
      approved: boolean;      // consultant approved this section
    }>;
    tokensUsed?: number;
    aiModel?: string;
    generatedAt?: string;
  }>(),
  generatedBy: uuid("generated_by").references(() => users.id, { onDelete: "set null" }),
  validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
  validatedAt: timestamp("validated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("proj_doc_project_idx").on(table.projectId),
  templateIdx: index("proj_doc_template_idx").on(table.templateDocumentId),
}));

// === COMPOSE SECTION VERSIONS (feedback loop — AI vs consultant edits) ===
export const composeSectionVersions = pgTable("compose_section_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectDocumentId: uuid("project_document_id").references(() => projectDocuments.id, { onDelete: "cascade" }).notNull(),
  sectionMarker: varchar("section_marker", { length: 255 }).notNull(),
  version: integer("version").notNull().default(1),
  content: text("content").notNull(),
  source: varchar("source", { length: 50 }).notNull(), // "neemia_ai" or "consultant_edit"
  editedBy: uuid("edited_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  projDocIdx: index("csv_projdoc_idx").on(table.projectDocumentId),
}));

// === PROJECT CHECKLIST ===
export const projectChecklist = pgTable("project_checklist", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  source: varchar("source", { length: 20 }).notNull().default("manual"),
  templateId: uuid("template_id").references(() => documents.id, { onDelete: "cascade" }),
  done: boolean("done").notNull().default(false),
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0),
  // Document validity tracking
  issuedAt: timestamp("issued_at"),
  validUntil: timestamp("valid_until"),
  validityDays: integer("validity_days"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("proj_check_project_idx").on(table.projectId),
}));

// === SESSION CHECKLIST (document requirements at session level, pre-project) ===
export const sessionChecklist = pgTable("session_checklist", {
  id: uuid("id").defaultRandom().primaryKey(),
  folderId: uuid("folder_id").references(() => documentFolders.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  category: varchar("category", { length: 100 }).notNull().default("General"),
  source: varchar("source", { length: 20 }).notNull().default("manual"), // "ghid" or "manual"
  sourceRuleId: uuid("source_rule_id").references(() => rules.id, { onDelete: "set null" }),
  templateId: uuid("template_id").references(() => documents.id, { onDelete: "set null" }),
  done: boolean("done").notNull().default(false),
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  folderIdx: index("session_checklist_folder_idx").on(table.folderId),
  orgIdx: index("session_checklist_org_idx").on(table.organizationId),
}));

// === ELEMENT AUDIT LOG ===
export const elementAuditLog = pgTable("element_audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectElementId: uuid("project_element_id").references(() => projectElements.id, { onDelete: "cascade" }).notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  oldValidationStatus: validationStatusEnum("old_validation_status"),
  newValidationStatus: validationStatusEnum("new_validation_status"),
  changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
  changeSource: elementSourceEnum("change_source").notNull().default("manual"),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
}, (table) => ({
  elementIdx: index("audit_element_idx").on(table.projectElementId),
}));

// === SCORING CRITERIA (selection criteria per guide) ===
export const scoringCriteria = pgTable("scoring_criteria", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  description: text("description"),
  maxPoints: decimal("max_points", { precision: 5, scale: 2 }).notNull(),
  evaluationLogic: jsonb("evaluation_logic").$type<{
    type: "lookup" | "range" | "boolean" | "formula";
    elementKey?: string;
    referenceTableId?: string;
    lookupColumn?: string;
    ranges?: Array<{ min?: number; max?: number; points: number }>;
    formula?: string;
  }>(),
  category: varchar("category", { length: 100 }),
  sortOrder: integer("sort_order").default(0),
  sourcePage: integer("source_page"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  docIdx: index("scoring_doc_idx").on(table.documentId),
  orgIdx: index("scoring_org_idx").on(table.organizationId),
}));

// === PROJECT SCORES (computed per project per criteria) ===
export const projectScores = pgTable("project_scores", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  criteriaId: uuid("criteria_id").references(() => scoringCriteria.id, { onDelete: "cascade" }).notNull(),
  points: decimal("points", { precision: 5, scale: 2 }),
  maxPoints: decimal("max_points", { precision: 5, scale: 2 }).notNull(),
  reasoning: text("reasoning"),
  inputElements: jsonb("input_elements").$type<Record<string, any>>(),
  evaluatedAt: timestamp("evaluated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("score_project_idx").on(table.projectId),
}));

// === SOLOMON STRUCTURED OUTPUT (RAG v2 Sprint 5) ===

// Solomon eligibility conclusions — one row per verified condition
export const solomonEligibility = pgTable("solomon_eligibility", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  ruleName: text("rule_name").notNull(),
  ruleCategory: text("rule_category"),   // 'eligibilitate' | 'conformitate' | 'administrativ'
  status: text("status").notNull(),       // 'pass' | 'fail' | 'pending' | 'not_applicable'
  evidence: text("evidence"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  sourcePhase: text("source_phase"),      // 'Q4', 'Q5', etc.
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  projectIdx: index("sol_elig_project_idx").on(table.projectId),
  ruleUq: uniqueIndex("sol_elig_rule_uq").on(table.projectId, table.ruleName),
}));

// Solomon scoring estimates — one row per evaluated criterion
export const solomonScoring = pgTable("solomon_scoring", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  criterionName: text("criterion_name").notNull(),
  criterionCategory: text("criterion_category"),
  pointsEstimated: integer("points_estimated"),
  maxPoints: integer("max_points"),
  evidence: text("evidence"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  sourcePhase: text("source_phase"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  projectIdx: index("sol_score_project_idx").on(table.projectId),
  criterionUq: uniqueIndex("sol_score_criterion_uq").on(table.projectId, table.criterionName),
}));

// === FORM SPECS (Universal FormSpec from any form format) ===
export const formSpecs = pgTable("form_specs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull().default(""),
  programCode: text("program_code"),
  sourceFormat: text("source_format").notNull(), // xfa|acroform|docx|xlsx|online
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  spec: jsonb("spec").notNull(),                 // Full FormSpec JSON
  referenceData: jsonb("reference_data"),
  isActive: boolean("is_active").default(true),
  totalFields: integer("total_fields").default(0),
  extractedAt: timestamp("extracted_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  docIdx: index("formspec_doc_idx").on(table.documentId),
  orgIdx: index("formspec_org_idx").on(table.organizationId),
}));

// === FORM DATA (field values + page approvals per project per form) ===
export const formData = pgTable("form_data", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  formSpecId: uuid("form_spec_id").references(() => formSpecs.id, { onDelete: "cascade" }).notNull(),
  fieldValues: jsonb("field_values").notNull().default({}),
  fieldSources: jsonb("field_sources").default({}),     // { "field_name": "onrc" | "solomon" | "calculated" | "manual" }
  pageApprovals: jsonb("page_approvals").notNull().default({}),
  completionPercent: integer("completion_percent").default(0),
  approvedPagesCount: integer("approved_pages_count").default(0),
  totalPages: integer("total_pages"),
  allPagesApproved: boolean("all_pages_approved").default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  projectIdx: index("formdata_project_idx").on(table.projectId),
  formSpecIdx: index("formdata_formspec_idx").on(table.formSpecId),
  projectFormUq: uniqueIndex("formdata_project_form_uq").on(table.projectId, table.formSpecId),
}));

// === SOLOMON CONVERSATIONS ===
export const solomonConversations = pgTable("solomon_conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  model: varchar("model", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("solomon_conv_project_idx").on(table.projectId),
}));

// === SOLOMON MESSAGES ===
export const solomonMessages = pgTable("solomon_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => solomonConversations.id, { onDelete: "cascade" }).notNull(),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  attachments: jsonb("attachments"),
  elementsExtracted: jsonb("elements_extracted"),
  tokensInput: integer("tokens_input"),
  tokensOutput: integer("tokens_output"),
  cost: decimal("cost", { precision: 10, scale: 6 }),
  model: varchar("model", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  convIdx: index("msg_conv_idx").on(table.conversationId),
}));

// === AI USAGE LOG ===
export const aiUsageLog = pgTable("ai_usage_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  agent: aiAgentEnum("agent").notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  tokensInput: integer("tokens_input").notNull(),
  tokensOutput: integer("tokens_output").notNull(),
  cost: decimal("cost", { precision: 10, scale: 6 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("ai_log_org_idx").on(table.organizationId),
  projectIdx: index("ai_log_project_idx").on(table.projectId),
}));

// === AUDIT LOG ===
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: uuid("entity_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("audit_org_idx").on(table.organizationId),
}));

// === CONFIG (per organization) ===
export const orgConfig = pgTable("org_config", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull().unique(),
  solomonModel: varchar("solomon_model", { length: 100 }).default("claude-opus-4-6"),
  solomonET: boolean("solomon_et").default(true),
  neemiaModel: varchar("neemia_model", { length: 100 }).default("claude-sonnet-4-6"),
  reguliFixeModel: varchar("reguli_fixe_model", { length: 100 }).default("claude-sonnet-4-6"),
  reguliInterpModel: varchar("reguli_interp_model", { length: 100 }).default("claude-opus-4-6"),
  reguliInterpET: boolean("reguli_interp_et").default(true),
  reviewThreshold: decimal("review_threshold", { precision: 3, scale: 2 }).default("0.85"),
  solomonLabel: varchar("solomon_label", { length: 100 }).default("Solomon"),
  neemiaLabel: varchar("neemia_label", { length: 100 }).default("Neemia"),
  notifNewElement: boolean("notif_new_element").default(true),
  notifEligFail: boolean("notif_elig_fail").default(true),
  notifTemplateReady: boolean("notif_template_ready").default(true),
  notifDeadline: boolean("notif_deadline").default(true),
  emailFrom: varchar("email_from", { length: 255 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

// === SOLOMON KNOWLEDGE BASE (actualizări legislative, bune practici, corecții) ===
export const solomonKnowledge = pgTable("solomon_knowledge", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 100 }).notNull(), // "legislatie", "praguri", "proceduri", "ghid_specific", "bune_practici", "corectii", "wk_*" (writing kit)
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(), // the actual knowledge/rule/update
  sourceUrl: varchar("source_url", { length: 1000 }), // link to MO, regulation, etc.
  sourceReference: varchar("source_reference", { length: 500 }), // "OUG 12/2026", "Reg. UE 2024/xxx"
  validFrom: timestamp("valid_from"), // when this rule takes effect
  validUntil: timestamp("valid_until"), // when it expires (null = still valid)
  priority: integer("priority").default(0), // higher = shown first
  enabled: boolean("enabled").default(true),
  embedding: vector1536("embedding"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
});

// === API INTEGRATIONS ===
export const apiIntegrations = pgTable("api_integrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  apiKeyEncrypted: text("api_key_encrypted"),
  enabled: boolean("enabled").notNull().default(true),
  autoSync: boolean("auto_sync").default(false),
  syncIntervalDays: integer("sync_interval_days").default(7),
  status: varchar("status", { length: 50 }).default("configured"),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestResult: varchar("last_test_result", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// === REFERENCE VALUES (dynamic calculation parameters per organization) ===
export const referenceValues = pgTable("reference_values", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  key: varchar("key", { length: 100 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  orgKeyIdx: uniqueIndex("ref_val_org_key_idx").on(table.organizationId, table.key),
}));

// === PROVIDER ===
export const providerUsers = pgTable("provider_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cabinetCodes = pgTable("cabinet_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  plan: planEnum("plan").notNull(),
  maxUsers: integer("max_users").notNull().default(1),
  trialDays: integer("trial_days").notNull().default(30),
  cui: varchar("cui", { length: 20 }),
  companyName: varchar("company_name", { length: 500 }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  activatedAt: timestamp("activated_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => providerUsers.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// === EXTRACTION CACHE (content-hash-based dedup) ===
export const extractionCache = pgTable("extraction_cache", {
  id: uuid("id").defaultRandom().primaryKey(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  extractionType: varchar("extraction_type", { length: 50 }).notNull(), // "text", "classification", "rules_fixed", "rules_interpreted", "elements", "tables", "company", "bilant"
  result: jsonb("result").notNull(), // cached extraction output
  pageCount: integer("page_count"),
  modelUsed: varchar("model_used", { length: 100 }),
  tokensUsed: integer("tokens_used"),
  processingTimeMs: integer("processing_time_ms"),
  hitCount: integer("hit_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // null = never expires
}, (table) => ({
  hashTypeIdx: uniqueIndex("cache_hash_type_idx").on(table.contentHash, table.extractionType, table.organizationId),
  orgIdx: index("cache_org_idx").on(table.organizationId),
}));

// === PASSWORD RESET TOKENS ===
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenIdx: uniqueIndex("prt_token_hash_idx").on(table.tokenHash),
  userIdx: index("prt_user_idx").on(table.userId),
}));

// === GUIDE CHUNKS (RAG — vector embeddings for guide text retrieval) ===
export const guideChunks = pgTable("guide_chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  tokenCount: integer("token_count").notNull().default(0),
  pageStart: integer("page_start"),
  pageEnd: integer("page_end"),
  sectionType: varchar("section_type", { length: 50 }),
  sectionTitle: varchar("section_title", { length: 500 }),
  embedding: vector1536("embedding"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  docIdx: index("guide_chunks_doc_idx").on(table.documentId),
  orgIdx: index("guide_chunks_org_idx").on(table.organizationId),
  sectionIdx: index("guide_chunks_section_idx").on(table.sectionType),
}));

// === BUDGET ITEMS (line-by-line project budget — Q4 Dimensionare) ===
export const budgetItems = pgTable("budget_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  // Identification
  category: varchar("category", { length: 100 }).notNull(),
  subcategory: varchar("subcategory", { length: 255 }),
  description: varchar("description", { length: 500 }).notNull(),
  // Values
  unitCost: decimal("unit_cost", { precision: 15, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  totalCost: decimal("total_cost", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
  // Eligibility
  eligible: boolean("eligible").notNull().default(true),
  eligibilityNotes: text("eligibility_notes"),
  // Guide reference (price ceiling)
  guideRefTableId: uuid("guide_ref_table_id").references(() => guideReferenceTables.id, { onDelete: "set null" }),
  guideMaxPrice: decimal("guide_max_price", { precision: 15, scale: 2 }),
  exceedsCeiling: boolean("exceeds_ceiling").default(false),
  // Link to element group
  elementGroupInstance: integer("element_group_instance"),
  // Metadata
  sortOrder: integer("sort_order").default(0),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  projectIdx: index("budget_project_idx").on(table.projectId),
  orgIdx: index("budget_org_idx").on(table.organizationId),
}));

// === RAG v2 — UNIFIED CHUNKS (Voyage embeddings, 1024 dims) ===
export const chunks = pgTable("chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  cabinetId: uuid("cabinet_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id"),  // NULL for knowledge_base entries
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(), // 'session' | 'knowledge_base'
  content: text("content").notNull(),
  embedding: vector1024("embedding"),
  // content_tsv — added via raw SQL migration (GENERATED ALWAYS AS column)
  metadata: jsonb("metadata").notNull().default({}),
  // metadata shape: { layer, topic, doc_type, page, section, importance }
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  cabinetSourceIdx: index("chunks_cabinet_source_idx").on(table.cabinetId, table.sourceType),
  sessionIdx: index("chunks_session_idx").on(table.sessionId),
  documentIdx: index("chunks_document_idx").on(table.documentId),
}));
