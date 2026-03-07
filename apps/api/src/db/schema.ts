import { pgTable, uuid, varchar, text, integer, decimal, boolean, timestamp, pgEnum, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";

// === ENUMS ===
export const planEnum = pgEnum("plan", ["starter", "professional", "enterprise"]);
export const orgStatusEnum = pgEnum("org_status", ["active", "trial", "inactive", "expired"]);
export const userRoleEnum = pgEnum("user_role", ["admin", "consultant", "viewer"]);
export const userStatusEnum = pgEnum("user_status", ["active", "invited", "disabled", "pending_cabinet"]);
export const themeEnum = pgEnum("theme", ["dark", "light"]);
export const formaJuridicaEnum = pgEnum("forma_juridica", ["SRL", "SA", "SNC", "SCS", "SCA", "PFA", "II", "IF", "SC", "RA", "SA_BVB"]);
export const companyStatusEnum = pgEnum("company_status", ["functiune", "radiata", "dizolvata", "lichidare"]);
export const folderTypeEnum = pgEnum("folder_type", ["program", "masura", "sesiune", "ghiduri", "templateuri", "clienti_prospecti", "clienti_finali"]);
export const docFileTypeEnum = pgEnum("doc_file_type", ["pdf", "docx", "xlsx", "doc"]);
export const docStatusEnum = pgEnum("doc_status", ["uploaded", "processing", "processed", "error"]);
export const docProcessingTypeEnum = pgEnum("doc_processing_type", ["ghid", "template", "reference", "client_doc"]);
export const ruleTypeEnum = pgEnum("rule_type", ["fixed", "interpreted"]);
export const fieldTypeEnum = pgEnum("field_type", ["text", "number", "textarea", "date", "table", "signature", "select"]);
export const projectStatusEnum = pgEnum("project_status", ["draft", "in_progress", "review", "submitted", "approved", "rejected"]);
export const eligibilityStatusEnum = pgEnum("eligibility_status", ["passed", "failed", "pending", "not_applicable"]);
export const elementSourceEnum = pgEnum("element_source", ["onrc", "solomon", "manual", "calculated", "ghid"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);
export const aiAgentEnum = pgEnum("ai_agent", ["solomon", "neemia", "ghid_rules", "ocr"]);
export const associateTypeEnum = pgEnum("associate_type", ["pf", "pj"]);
export const financialSourceEnum = pgEnum("financial_source", ["onrc", "anaf_upload"]);
export const generatedDocStatusEnum = pgEnum("generated_doc_status", ["generating", "generated", "validated", "error"]);

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// === USERS ===
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id),
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
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  storageKey: varchar("storage_key", { length: 500 }).notNull(),
  originalName: varchar("original_name", { length: 500 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  size: integer("size").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// === COMPANIES ===
export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
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
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

// === DOCUMENT FOLDERS (tree) ===
export const documentFolders = pgTable("document_folders", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  parentId: uuid("parent_id"),
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
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  fileType: docFileTypeEnum("file_type").notNull(),
  fileId: uuid("file_id").references(() => files.id).notNull(),
  fileSize: integer("file_size").notNull(),
  pageCount: integer("page_count").default(0),
  status: docStatusEnum("status").notNull().default("uploaded"),
  processingType: docProcessingTypeEnum("processing_type"),
  tags: text("tags").array(),
  uploadedBy: uuid("uploaded_by").references(() => users.id).notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
}, (table) => ({
  orgIdx: index("doc_org_idx").on(table.organizationId),
  folderIdx: index("doc_folder_idx").on(table.folderId),
}));

// === RULES (from guides) ===
export const rules = pgTable("rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  type: ruleTypeEnum("type").notNull(),
  category: varchar("category", { length: 100 }),
  description: text("description").notNull(),
  condition: jsonb("condition"),
  sourcePage: integer("source_page"),
  sourceText: text("source_text"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  validated: boolean("validated").notNull().default(false),
  validatedBy: uuid("validated_by").references(() => users.id),
  validatedAt: timestamp("validated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// === TEMPLATE ELEMENTS ===
export const templateElements = pgTable("template_elements", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
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
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  folderId: uuid("folder_id").references(() => documentFolders.id).notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  status: projectStatusEnum("status").notNull().default("draft"),
  valoare: decimal("valoare", { precision: 15, scale: 2 }),
  consultantId: uuid("consultant_id").references(() => users.id).notNull(),
  lockedBy: uuid("locked_by").references(() => users.id),
  lockedAt: timestamp("locked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("project_org_idx").on(table.organizationId),
  companyIdx: index("project_company_idx").on(table.companyId),
}));

// === PROJECT ELEMENTS (field values) ===
export const projectElements = pgTable("project_elements", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  templateElementId: uuid("template_element_id").references(() => templateElements.id).notNull(),
  value: text("value"),
  source: elementSourceEnum("source").notNull().default("manual"),
  sourceDocumentId: uuid("source_document_id").references(() => documents.id),
  confirmed: boolean("confirmed").notNull().default(false),
  confirmedBy: uuid("confirmed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdx: index("proj_el_project_idx").on(table.projectId),
}));

// === PROJECT ELIGIBILITY ===
export const projectEligibility = pgTable("project_eligibility", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  ruleId: uuid("rule_id").references(() => rules.id).notNull(),
  status: eligibilityStatusEnum("status").notNull().default("pending"),
  autoResult: boolean("auto_result"),
  overrideResult: boolean("override_result"),
  overrideBy: uuid("override_by").references(() => users.id),
  notes: text("notes"),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
});

// === PROJECT DOCUMENTS (generated by Neemia) ===
export const projectDocuments = pgTable("project_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  templateDocumentId: uuid("template_document_id").references(() => documents.id).notNull(),
  generatedFileId: uuid("generated_file_id").references(() => files.id),
  status: generatedDocStatusEnum("status").notNull().default("generating"),
  pagesCompleted: integer("pages_completed").default(0),
  totalPages: integer("total_pages").default(0),
  validatedBy: uuid("validated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// === PROJECT CHECKLIST ===
export const projectChecklist = pgTable("project_checklist", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  source: varchar("source", { length: 20 }).notNull().default("manual"),
  templateId: uuid("template_id").references(() => documents.id),
  done: boolean("done").notNull().default(false),
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  userId: uuid("user_id").references(() => users.id),
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
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
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
  organizationId: uuid("organization_id").references(() => organizations.id).notNull().unique(),
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
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// === API INTEGRATIONS ===
export const apiIntegrations = pgTable("api_integrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
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
  organizationId: uuid("organization_id").references(() => organizations.id),
  activatedAt: timestamp("activated_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdBy: uuid("created_by").references(() => providerUsers.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
