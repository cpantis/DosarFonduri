import { pgTable, uuid, varchar, text, integer, bigint, decimal, boolean, timestamp, pgEnum, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";

// === ENUMS ===
export const planEnum = pgEnum("plan", ["starter", "professional", "enterprise"]);
export const orgStatusEnum = pgEnum("org_status", ["active", "trial", "inactive", "expired"]);
export const userRoleEnum = pgEnum("user_role", ["admin", "consultant", "viewer"]);
export const userStatusEnum = pgEnum("user_status", ["active", "invited", "disabled", "pending_cabinet"]);
export const themeEnum = pgEnum("theme", ["dark", "light"]);
export const formaJuridicaEnum = pgEnum("forma_juridica", ["SRL", "SA", "SNC", "SCS", "SCA", "PFA", "II", "IF", "SC", "RA", "SA_BVB"]);
export const companyStatusEnum = pgEnum("company_status", ["functiune", "radiata", "dizolvata", "lichidare"]);
export const folderTypeEnum = pgEnum("folder_type", ["program", "masura", "sesiune", "ghiduri", "templateuri", "clienti_prospecti", "clienti_finali"]);
export const docFileTypeEnum = pgEnum("doc_file_type", ["pdf", "docx", "xlsx", "doc", "png", "jpg"]);
export const docStatusEnum = pgEnum("doc_status", ["uploaded", "processing", "processed", "error", "failed"]);
export const docProcessingTypeEnum = pgEnum("doc_processing_type", ["ghid", "template", "reference", "client_doc", "reference_data"]);
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
export const placeholderMappedByEnum = pgEnum("placeholder_mapped_by", ["auto", "manual"]);
export const validationStatusEnum = pgEnum("validation_status", ["pending", "valid", "warning", "invalid"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);
export const aiAgentEnum = pgEnum("ai_agent", ["solomon", "neemia", "ghid_rules", "ocr"]);
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
  invitedBy: uuid("invited_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at"),
});

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
});

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
  certificatFileId: uuid("certificat_file_id").references(() => files.id),
  processingStatus: varchar("processing_status", { length: 20 }).default("idle"),
  processingError: text("processing_error"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
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
});

// === COMPANY ADMINISTRATORS ===
export const companyAdministrators = pgTable("company_administrators", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 100 }),
  powers: varchar("powers", { length: 255 }),
  mandateDuration: varchar("mandate_duration", { length: 50 }),
  appointmentDate: varchar("appointment_date", { length: 20 }),
});

// === COMPANY FINANCIALS ===
export const companyFinancials = pgTable("company_financials", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  year: integer("year").notNull(),
  source: financialSourceEnum("source").notNull(),
  fileId: uuid("file_id").references(() => files.id),
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
});

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
  createdBy: uuid("created_by").references(() => users.id).notNull(),
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
  fileId: uuid("file_id").references(() => files.id).notNull(),
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
  uploadedBy: uuid("uploaded_by").references(() => users.id).notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  processingError: text("processing_error"),
  trustScore: decimal("trust_score", { precision: 3, scale: 2 }),
  completenessReport: jsonb("completeness_report").$type<{
    trustScore: number;
    categoriesFound: string[];
    categoriesMissing: string[];
    rulesNeedingReview: number;
    sectionsWithoutRules: string[];
    warnings: string[];
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
  validatedBy: uuid("validated_by").references(() => users.id),
  validatedAt: timestamp("validated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  lookupTableId: uuid("lookup_table_id"),
  collectionOrder: integer("collection_order").default(0),
  required: boolean("required").notNull().default(false),
  minCount: integer("min_count").notNull().default(1),
  maxCount: integer("max_count"),
  helpText: text("help_text"),
  isDerived: boolean("is_derived").notNull().default(false),
  derivationFormula: text("derivation_formula"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  guideIdx: index("elem_def_guide_idx").on(table.guideDocumentId),
  orgIdx: index("elem_def_org_idx").on(table.organizationId),
  keyGuideIdx: uniqueIndex("elem_def_key_guide_idx").on(table.elementKey, table.guideDocumentId),
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
  validatedBy: uuid("validated_by").references(() => users.id),
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
  validatedBy: uuid("validated_by").references(() => users.id),
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
  validatedBy: uuid("validated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  docIdx: index("template_el_doc_idx").on(table.documentId),
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
  deadline: timestamp("deadline"),
  consultantId: uuid("consultant_id").references(() => users.id).notNull(),
  lockedBy: uuid("locked_by").references(() => users.id),
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
  templateElementId: uuid("template_element_id").references(() => templateElements.id),  // nullable now — backward compat
  elementDefId: uuid("element_def_id").references(() => elementDefinitions.id),  // NEW anchor — will become NOT NULL after migration
  value: text("value"),
  source: elementSourceEnum("source").notNull().default("manual"),
  sourceDocumentId: uuid("source_document_id").references(() => documents.id),
  confirmed: boolean("confirmed").notNull().default(false),
  confirmedBy: uuid("confirmed_by").references(() => users.id),
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
  overrideBy: uuid("override_by").references(() => users.id),
  notes: text("notes"),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("proj_elig_org_idx").on(table.organizationId),
}));

// === PROJECT DOCUMENTS (generated by Neemia) ===
export const projectDocuments = pgTable("project_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  templateDocumentId: uuid("template_document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  generatedFileId: uuid("generated_file_id").references(() => files.id),
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
  generatedBy: uuid("generated_by").references(() => users.id),
  validatedBy: uuid("validated_by").references(() => users.id),
  validatedAt: timestamp("validated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// === COMPOSE SECTION VERSIONS (feedback loop — AI vs consultant edits) ===
export const composeSectionVersions = pgTable("compose_section_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectDocumentId: uuid("project_document_id").references(() => projectDocuments.id, { onDelete: "cascade" }).notNull(),
  sectionMarker: varchar("section_marker", { length: 255 }).notNull(),
  version: integer("version").notNull().default(1),
  content: text("content").notNull(),
  source: varchar("source", { length: 50 }).notNull(), // "neemia_ai" or "consultant_edit"
  editedBy: uuid("edited_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  changedBy: uuid("changed_by").references(() => users.id),
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

// === SOLOMON CONVERSATIONS ===
export const solomonConversations = pgTable("solomon_conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  userId: uuid("user_id").references(() => users.id).notNull(),
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
  neemiaModel: varchar("neemia_model", { length: 100 }).default("claude-sonnet-4-20250514"),
  reguliFixeModel: varchar("reguli_fixe_model", { length: 100 }).default("claude-sonnet-4-20250514"),
  reguliInterpModel: varchar("reguli_interp_model", { length: 100 }).default("claude-opus-4-6"),
  reguliInterpET: boolean("reguli_interp_et").default(true),
  reviewThreshold: decimal("review_threshold", { precision: 3, scale: 2 }).default("0.85"),
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
  createdBy: uuid("created_by").references(() => users.id),
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
  organizationId: uuid("organization_id").references(() => organizations.id),
  activatedAt: timestamp("activated_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => providerUsers.id).notNull(),
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
