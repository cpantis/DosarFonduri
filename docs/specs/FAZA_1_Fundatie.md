# FAZA 1 — Fundație
## Setup proiect, Schema DB, Autentificare, Cod cabinet, Layout

---

## 1.1 STRUCTURA PROIECT

### Inițializare

```bash
# Monorepo cu turborepo
npx create-turbo@latest dosarfonduri
cd dosarfonduri

# Frontend
npx create-next-app@latest apps/web --typescript --tailwind --app --src-dir --import-alias "@/*"

# Backend
mkdir -p apps/api/src/{routes,middleware,services,jobs,lib}
cd apps/api && npm init -y && npm install hono @hono/node-server drizzle-orm postgres dotenv bullmq ioredis zod
npm install -D typescript @types/node tsx drizzle-kit

# Shared types
mkdir -p packages/shared/src
```

### Structura finală

```
dosarfonduri/
├── apps/
│   ├── web/                          # Next.js 15 (Vercel)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/
│   │   │   │   │   ├── login/page.tsx
│   │   │   │   │   └── layout.tsx
│   │   │   │   ├── (app)/
│   │   │   │   │   ├── dashboard/page.tsx
│   │   │   │   │   ├── companies/page.tsx
│   │   │   │   │   ├── documents/page.tsx
│   │   │   │   │   ├── documents/template/[id]/page.tsx
│   │   │   │   │   ├── projects/page.tsx
│   │   │   │   │   ├── projects/[id]/page.tsx
│   │   │   │   │   ├── settings/page.tsx
│   │   │   │   │   ├── admin/page.tsx
│   │   │   │   │   └── layout.tsx       # Sidebar + Topbar
│   │   │   │   ├── provider/
│   │   │   │   │   ├── login/page.tsx
│   │   │   │   │   ├── dashboard/page.tsx
│   │   │   │   │   └── layout.tsx
│   │   │   │   ├── layout.tsx            # Root layout
│   │   │   │   └── globals.css
│   │   │   ├── components/
│   │   │   │   ├── ui/                   # shadcn/ui
│   │   │   │   ├── layout/
│   │   │   │   │   ├── Sidebar.tsx
│   │   │   │   │   ├── Topbar.tsx
│   │   │   │   │   ├── SplitPane.tsx
│   │   │   │   │   └── ThemeProvider.tsx
│   │   │   │   └── shared/
│   │   │   │       ├── StatusBadge.tsx
│   │   │   │       ├── ProgressBar.tsx
│   │   │   │       └── EmptyState.tsx
│   │   │   ├── lib/
│   │   │   │   ├── api.ts               # fetch wrapper
│   │   │   │   ├── auth.ts
│   │   │   │   └── utils.ts
│   │   │   ├── hooks/
│   │   │   │   ├── useAuth.ts
│   │   │   │   ├── useTheme.ts
│   │   │   │   └── useApi.ts
│   │   │   └── styles/
│   │   │       └── tokens.css           # CSS variables dark/light
│   │   ├── tailwind.config.ts
│   │   └── next.config.ts
│   │
│   └── api/                             # Hono (Railway)
│       ├── src/
│       │   ├── index.ts                 # Hono app entry
│       │   ├── db/
│       │   │   ├── schema.ts            # Drizzle schema complet
│       │   │   ├── index.ts             # DB connection
│       │   │   └── migrations/
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── companies.ts
│       │   │   ├── documents.ts
│       │   │   ├── rules.ts
│       │   │   ├── templates.ts
│       │   │   ├── projects.ts
│       │   │   ├── solomon.ts
│       │   │   ├── neemia.ts
│       │   │   ├── admin.ts
│       │   │   ├── config.ts
│       │   │   └── provider.ts
│       │   ├── middleware/
│       │   │   ├── auth.ts              # JWT verify + org context
│       │   │   ├── rateLimit.ts
│       │   │   └── audit.ts             # Log acțiuni
│       │   ├── services/
│       │   │   ├── anthropic.ts         # Wrapper Anthropic API
│       │   │   ├── onrc.ts              # termene.ro API
│       │   │   ├── ocr.ts              # PyMuPDF + Vision
│       │   │   ├── templateParser.ts    # python-docx bridge
│       │   │   └── storage.ts          # R2/S3
│       │   ├── jobs/
│       │   │   ├── processGuide.ts     # Ghid → reguli
│       │   │   ├── processTemplate.ts  # Template → elemente
│       │   │   ├── syncOnrc.ts         # Sync periodic
│       │   │   └── worker.ts           # BullMQ worker
│       │   └── lib/
│       │       ├── redis.ts
│       │       ├── queue.ts
│       │       └── env.ts
│       ├── drizzle.config.ts
│       ├── tsconfig.json
│       └── package.json
│
└── packages/
    └── shared/
        └── src/
            ├── types.ts                 # Tipuri partajate
            ├── constants.ts             # Forme juridice, statusuri
            └── validators.ts            # Zod schemas
```

---

## 1.2 SCHEMA BAZĂ DE DATE COMPLETĂ

### Fișier: `apps/api/src/db/schema.ts`

```typescript
import { pgTable, uuid, varchar, text, integer, decimal, boolean, timestamp, pgEnum, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ═══ ENUMS ═══
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

// ═══ ORGANIZATIONS ═══
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

// ═══ USERS ═══
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

// ═══ FILES (stocare centralizată) ═══
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

// ═══ COMPANIES ═══
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
  stare: companyStatusEnum("stare").notNull().default("functiune"),
  durata: varchar("durata", { length: 50 }),
  anInfiintare: integer("an_infiintare"),
  capitalSocial: decimal("capital_social", { precision: 15, scale: 2 }),
  moneda: varchar("moneda", { length: 10 }),
  partiSociale: integer("parti_sociale"),
  actiuni: integer("actiuni"),
  valoareParte: decimal("valoare_parte", { precision: 15, scale: 2 }),
  valoareActiune: decimal("valoare_actiune", { precision: 15, scale: 2 }),
  naturaCapital: jsonb("natura_capital"), // { privatAutohton, privatStrain, stat }
  patrimoniu_afectat: text("patrimoniu_afectat"), // doar PFA/II
  reprezentantIF: varchar("reprezentant_if", { length: 255 }), // doar IF
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

// ═══ COMPANY ASSOCIATES ═══
export const companyAssociates = pgTable("company_associates", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  type: associateTypeEnum("type").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 100 }), // asociat, acționar, comanditat
  citizenshipOrCountry: varchar("citizenship_country", { length: 100 }),
  contribution: decimal("contribution", { precision: 15, scale: 2 }),
  shares: integer("shares"),
  pctBenefits: decimal("pct_benefits", { precision: 5, scale: 2 }),
  pctLosses: decimal("pct_losses", { precision: 5, scale: 2 }),
  tipAsociat: varchar("tip_asociat", { length: 50 }), // comanditat/comanditar pt SCS/SCA
});

// ═══ COMPANY ADMINISTRATORS ═══
export const companyAdministrators = pgTable("company_administrators", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 100 }),
  powers: varchar("powers", { length: 255 }),
  mandateDuration: varchar("mandate_duration", { length: 50 }),
  appointmentDate: varchar("appointment_date", { length: 20 }),
});

// ═══ COMPANY FINANCIALS (bilanțuri) ═══
export const companyFinancials = pgTable("company_financials", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  year: integer("year").notNull(),
  source: financialSourceEnum("source").notNull(),
  fileId: uuid("file_id").references(() => files.id),
  f10: jsonb("f10"), // bilanț prescurtat
  f20: jsonb("f20"), // cont profit & pierdere
  f30: jsonb("f30"), // date informative
  f40: jsonb("f40"), // active imobilizate
  processedAt: timestamp("processed_at"),
}, (table) => ({
  companyYearIdx: uniqueIndex("company_year_idx").on(table.companyId, table.year),
}));

// ═══ COMPANY IF MEMBERS ═══
export const companyIfMembers = pgTable("company_if_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 100 }),
  kinship: varchar("kinship", { length: 100 }),
  citizenship: varchar("citizenship", { length: 100 }),
  birthDate: varchar("birth_date", { length: 20 }),
});

// ═══ DOCUMENT FOLDERS (arbore) ═══
export const documentFolders = pgTable("document_folders", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  parentId: uuid("parent_id"), // self-referencing, set after table creation
  name: varchar("name", { length: 255 }).notNull(),
  type: folderTypeEnum("type").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
}, (table) => ({
  orgIdx: index("folder_org_idx").on(table.organizationId),
  parentIdx: index("folder_parent_idx").on(table.parentId),
}));

// ═══ DOCUMENTS ═══
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

// ═══ RULES (din ghiduri) ═══
export const rules = pgTable("rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  type: ruleTypeEnum("type").notNull(),
  category: varchar("category", { length: 100 }), // eligibilitate, selecție, financiar
  description: text("description").notNull(),
  condition: jsonb("condition"), // condiție structurată
  sourcePage: integer("source_page"),
  sourceText: text("source_text"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  validated: boolean("validated").notNull().default(false),
  validatedBy: uuid("validated_by").references(() => users.id),
  validatedAt: timestamp("validated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══ TEMPLATE ELEMENTS ═══
export const templateElements = pgTable("template_elements", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  key: varchar("key", { length: 255 }).notNull(), // "denumire_firma" sau "B1.VanzariFizicePrevizionate[0].Categ"
  label: varchar("label", { length: 255 }).notNull(), // "Denumirea completă"
  fieldType: fieldTypeEnum("field_type").notNull().default("text"),
  pageNum: integer("page_num"),
  lineNum: integer("line_num"),
  group: varchar("group", { length: 50 }), // "general", "B1", "B4" — secțiunea XFA
  isRepeating: boolean("is_repeating").notNull().default(false), // câmp din tabel repetitiv
  rowIndex: integer("row_index"), // index rând pentru câmpuri repetitive (null = simplu)
  detected: boolean("detected").notNull().default(true),
  validated: boolean("validated").notNull().default(false),
  validatedBy: uuid("validated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  docIdx: index("template_el_doc_idx").on(table.documentId),
}));

// ═══ PROJECTS ═══
export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  folderId: uuid("folder_id").references(() => documentFolders.id).notNull(), // sesiunea
  name: varchar("name", { length: 500 }).notNull(),
  status: projectStatusEnum("status").notNull().default("draft"),
  valoare: decimal("valoare", { precision: 15, scale: 2 }),
  consultantId: uuid("consultant_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("project_org_idx").on(table.organizationId),
  companyIdx: index("project_company_idx").on(table.companyId),
}));

// ═══ PROJECT ELEMENTS (valori câmpuri) ═══
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

// ═══ PROJECT ELIGIBILITY ═══
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

// ═══ PROJECT DOCUMENTS (generate de Neemia) ═══
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

// ═══ PROJECT CHECKLIST (Documente necesare proiect) ═══
// Referință UI: 05b_ProjectView.jsx → ChecklistView
// Lista documentelor pe care consultantul trebuie să le pregătească
export const projectChecklist = pgTable("project_checklist", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(), // "Acte firmă", "Documente financiare", "Documente proiect", "Alte documente"
  source: varchar("source", { length: 20 }).notNull().default("manual"), // "ghid" (extras din reguli) | "manual" (adăugat de consultant)
  templateId: uuid("template_id").references(() => documents.id), // template mapat din Neemia (null = fără template)
  done: boolean("done").notNull().default(false),
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══ SOLOMON CONVERSATIONS ═══
export const solomonConversations = pgTable("solomon_conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══ SOLOMON MESSAGES ═══
export const solomonMessages = pgTable("solomon_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => solomonConversations.id, { onDelete: "cascade" }).notNull(),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  attachments: jsonb("attachments"), // [{file_id, type, extracted_elements}]
  elementsExtracted: jsonb("elements_extracted"), // [{element_id, value, confidence}]
  tokensInput: integer("tokens_input"),
  tokensOutput: integer("tokens_output"),
  cost: decimal("cost", { precision: 10, scale: 6 }),
  model: varchar("model", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  convIdx: index("msg_conv_idx").on(table.conversationId),
}));

// ═══ AI USAGE LOG ═══
export const aiUsageLog = pgTable("ai_usage_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  userId: uuid("user_id").references(() => users.id).notNull(),
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

// ═══ AUDIT LOG ═══
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }), // project, company, document
  entityId: uuid("entity_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orgIdx: index("audit_org_idx").on(table.organizationId),
}));

// ═══ CONFIG (per organizație) ═══
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

// ═══ API INTEGRATIONS ═══
export const apiIntegrations = pgTable("api_integrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // ONRC, ANAF, Email, SMS, Custom
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

// ═══ PROVIDER ═══
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
  organizationId: uuid("organization_id").references(() => organizations.id), // null = nefolosit
  activatedAt: timestamp("activated_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdBy: uuid("created_by").references(() => providerUsers.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### Drizzle Config

```typescript
// apps/api/drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### DB Connection

```typescript
// apps/api/src/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

### Migrări

```bash
cd apps/api
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## 1.3 HONO APP ENTRY

```typescript
// apps/api/src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { authRoutes } from "./routes/auth";
import { companyRoutes } from "./routes/companies";
import { documentRoutes } from "./routes/documents";
import { projectRoutes } from "./routes/projects";
import { solomonRoutes } from "./routes/solomon";
import { neemiaRoutes } from "./routes/neemia";
import { adminRoutes } from "./routes/admin";
import { configRoutes } from "./routes/config";
import { providerRoutes } from "./routes/provider";
import { authMiddleware } from "./middleware/auth";
import { auditMiddleware } from "./middleware/audit";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use("*", cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));

// Public routes
app.route("/api/auth", authRoutes);
app.route("/api/provider", providerRoutes);

// Protected routes
app.use("/api/*", authMiddleware);
app.use("/api/*", auditMiddleware);
app.route("/api/companies", companyRoutes);
app.route("/api/documents", documentRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/solomon", solomonRoutes);
app.route("/api/neemia", neemiaRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/config", configRoutes);

// Health check
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

const port = parseInt(process.env.PORT || "8080");
console.log(`DosarFonduri API running on port ${port}`);
serve({ fetch: app.fetch, port });
```

---

## 1.4 AUTENTIFICARE

### Auth Middleware

```typescript
// apps/api/src/middleware/auth.ts
import { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { db } from "../db";
import { users, organizations } from "../db/schema";
import { eq } from "drizzle-orm";

export interface AuthContext {
  userId: string;
  organizationId: string | null;
  role: string;
  email: string;
}

export const authMiddleware = async (c: Context, next: Next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const payload = await verify(token, process.env.JWT_SECRET!);
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.sub as string),
    });
    if (!user || user.status === "disabled") return c.json({ error: "Unauthorized" }, 401);

    // Update last active
    await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));

    c.set("auth", {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    } as AuthContext);

    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
};
```

### Auth Routes

```typescript
// apps/api/src/routes/auth.ts
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { z } from "zod";
import { db } from "../db";
import { users, organizations, cabinetCodes } from "../db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const authRoutes = new Hono();

// ─── SIGNUP ───
const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  cui: z.string().optional(),        // pas 2
  cabinetCode: z.string().optional(), // pas 3 (doar primul user)
});

authRoutes.post("/signup", async (c) => {
  const body = signupSchema.parse(await c.req.json());
  
  // Check email duplicat
  const existing = await db.query.users.findFirst({ where: eq(users.email, body.email) });
  if (existing) return c.json({ error: "Email deja înregistrat" }, 400);

  const passwordHash = await bcrypt.hash(body.password, 12);

  // Check dacă email-ul e pre-înregistrat într-un cabinet
  const preRegistered = await db.query.users.findFirst({
    where: and(eq(users.email, body.email), eq(users.status, "invited")),
  });

  if (preRegistered) {
    // Flow: consultant invitat de admin → atașare automată
    await db.update(users).set({
      name: body.name,
      passwordHash,
      status: "active",
    }).where(eq(users.id, preRegistered.id));

    const token = await sign({ sub: preRegistered.id }, process.env.JWT_SECRET!);
    return c.json({ token, user: { ...preRegistered, status: "active" }, hasOrganization: true });
  }

  if (body.cabinetCode) {
    // Flow: primul user activează cabinet
    const code = await db.query.cabinetCodes.findFirst({
      where: and(
        eq(cabinetCodes.code, body.cabinetCode.toUpperCase()),
        eq(cabinetCodes.organizationId, null as any), // nefolosit
      ),
    });
    if (!code) return c.json({ error: "Cod invalid sau deja folosit" }, 400);
    if (code.expiresAt < new Date()) return c.json({ error: "Cod expirat" }, 400);

    // Creează organizația
    const [org] = await db.insert(organizations).values({
      name: body.name + " Cabinet", // se poate schimba ulterior
      code: code.code,
      plan: code.plan,
      maxUsers: code.maxUsers,
      trialEndsAt: new Date(Date.now() + code.trialDays * 86400000),
      status: code.trialDays > 0 ? "trial" : "active",
    }).returning();

    // Creează user ca admin
    const [user] = await db.insert(users).values({
      email: body.email,
      name: body.name,
      passwordHash,
      organizationId: org.id,
      role: "admin",
      status: "active",
    }).returning();

    // Marchează codul ca folosit
    await db.update(cabinetCodes).set({
      organizationId: org.id,
      activatedAt: new Date(),
    }).where(eq(cabinetCodes.id, code.id));

    const token = await sign({ sub: user.id }, process.env.JWT_SECRET!);
    return c.json({ token, user, organization: org, hasOrganization: true });
  }

  // Flow: signup fără cod, fără pre-înregistrare → pending
  const [user] = await db.insert(users).values({
    email: body.email,
    name: body.name,
    passwordHash,
    status: "pending_cabinet",
  }).returning();

  const token = await sign({ sub: user.id }, process.env.JWT_SECRET!);
  return c.json({ token, user, hasOrganization: false });
});

// ─── LOGIN ───
authRoutes.post("/login", async (c) => {
  const { email, password } = await c.req.json();
  
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) return c.json({ error: "Email sau parolă incorectă" }, 401);
  
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return c.json({ error: "Email sau parolă incorectă" }, 401);
  
  if (user.status === "disabled") return c.json({ error: "Cont dezactivat" }, 403);

  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));

  const token = await sign({ sub: user.id }, process.env.JWT_SECRET!);
  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, theme: user.theme },
    hasOrganization: !!user.organizationId,
  });
});

// ─── ME ───
authRoutes.get("/me", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  
  const payload = await verify(token, process.env.JWT_SECRET!);
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.sub as string),
  });
  if (!user) return c.json({ error: "User not found" }, 404);

  let org = null;
  if (user.organizationId) {
    org = await db.query.organizations.findFirst({
      where: eq(organizations.id, user.organizationId),
    });
  }

  return c.json({ user, organization: org });
});

// ─── VALIDATE CODE ───
authRoutes.post("/validate-code", async (c) => {
  const { code } = await c.req.json();
  
  const cabinetCode = await db.query.cabinetCodes.findFirst({
    where: and(
      eq(cabinetCodes.code, code.toUpperCase()),
      eq(cabinetCodes.organizationId, null as any),
    ),
  });

  if (!cabinetCode) return c.json({ valid: false, error: "Cod invalid sau deja folosit" });
  if (cabinetCode.expiresAt < new Date()) return c.json({ valid: false, error: "Cod expirat" });

  return c.json({
    valid: true,
    plan: cabinetCode.plan,
    maxUsers: cabinetCode.maxUsers,
    trialDays: cabinetCode.trialDays,
  });
});
```

---

## 1.5 DESIGN SYSTEM & LAYOUT

### CSS Variables

```css
/* apps/web/src/styles/tokens.css */
:root {
  /* Shared */
  --font-sans: 'DM Sans', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --r-sm: 6px;
  --r-md: 10px;
  --r-lg: 14px;
}

[data-theme="dark"] {
  --bg-deep: #0a0c10;
  --bg-surface: #12151c;
  --bg-elevated: #1a1e28;
  --bg-hover: #222838;
  --border: #2a3040;
  --border-active: #3d4760;
  --text-primary: #e8ecf4;
  --text-secondary: #8892a8;
  --text-muted: #5a6478;
  --accent-blue: #4d8bff;
  --accent-green: #34d399;
  --accent-red: #f87171;
  --accent-yellow: #fbbf24;
  --accent-purple: #a78bfa;
  --accent-orange: #fb923c;
  --shadow: 0 2px 8px rgba(0,0,0,.3);
}

[data-theme="light"] {
  --bg-deep: #f0f2f5;
  --bg-surface: #ffffff;
  --bg-elevated: #f8f9fb;
  --bg-hover: #eef0f4;
  --border: #d8dce5;
  --border-active: #b0b8c8;
  --text-primary: #1a1e28;
  --text-secondary: #5a6478;
  --text-muted: #8892a8;
  --accent-blue: #2563eb;
  --accent-green: #059669;
  --accent-red: #dc2626;
  --accent-yellow: #d97706;
  --accent-purple: #7c3aed;
  --accent-orange: #ea580c;
  --shadow: 0 2px 8px rgba(0,0,0,.08);
}
```

### Theme Provider

```typescript
// apps/web/src/components/layout/ThemeProvider.tsx
"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark", toggle: () => {}
});

export function ThemeProvider({ children, initialTheme }: { children: React.ReactNode; initialTheme?: Theme }) {
  const [theme, setTheme] = useState<Theme>(initialTheme || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("df-theme", theme);
    // Sync to API
    fetch("/api/auth/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme }),
    }).catch(() => {});
  }, [theme]);

  const toggle = () => setTheme(t => t === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

### Sidebar

```typescript
// apps/web/src/components/layout/Sidebar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "@/hooks/useAuth";

const NAV_ITEMS = [
  { section: "Principal", items: [
    { href: "/dashboard", icon: "📊", label: "Panou" },
    { href: "/companies", icon: "🏢", label: "Firme" },
    { href: "/documents", icon: "📃", label: "Documente" },
    { href: "/projects", icon: "💼", label: "Proiecte" },
  ]},
  { section: "Configurare", items: [
    { href: "/settings", icon: "🛠", label: "Configurări" },
  ]},
  { section: "Sistem", items: [
    { href: "/admin", icon: "⚙️", label: "Admin" },
  ]},
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { user } = useAuth();

  return (
    <aside className="w-60 min-w-60 bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col h-full transition-colors">
      {/* Logo */}
      <div className="p-5 flex items-center gap-3 border-b border-[var(--border)]">
        <div className="w-9 h-9 rounded-[10px] bg-[var(--accent-blue)] flex items-center justify-center text-white text-base font-extrabold shadow-md">DF</div>
        <span className="text-[17px] font-extrabold tracking-tight text-[var(--text-primary)]">DosarFonduri</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(section => (
          <div key={section.section}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] px-3 pt-4 pb-1.5">{section.section}</div>
            {section.items.map(item => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] font-semibold"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  }`}>
                  <span className="w-5 text-center text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--border)] flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-[var(--accent-purple)] flex items-center justify-center text-xs font-bold text-white">
          {user?.name?.split(" ").map(w => w[0]).join("").slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{user?.name}</div>
          <div className="text-[11px] text-[var(--text-muted)]">{user?.role === "admin" ? "Administrator" : user?.role === "consultant" ? "Consultant" : "Vizualizare"}</div>
        </div>
        <button
          onClick={toggle}
          className="w-8 h-8 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] flex items-center justify-center text-base transition-all hover:border-[var(--accent-blue)] hover:scale-105"
          title={theme === "dark" ? "Comută la Light Mode" : "Comută la Dark Mode"}>
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>
    </aside>
  );
}
```

### App Layout

```typescript
// apps/web/src/app/(app)/layout.tsx
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeProvider } from "@/components/layout/ThemeProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--bg-deep)] text-[var(--text-primary)] transition-colors">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
}
```

---

## 1.6 SPLIT PANE (Componentă reutilizabilă)

```typescript
// apps/web/src/components/layout/SplitPane.tsx
"use client";
import { useState, useRef, useEffect, useCallback, ReactNode } from "react";

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  defaultWidth?: number;
  minLeft?: number;
  minRight?: number;
  maxRight?: number;
  side?: "left" | "right"; // care parte are lățime fixă
}

export function SplitPane({ left, right, defaultWidth = 320, minLeft = 200, minRight = 200, maxRight = 600, side = "right" }: SplitPaneProps) {
  const [panelW, setPanelW] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const nw = side === "right" ? rect.right - e.clientX : e.clientX - rect.left;
      const cl = Math.max(minRight, Math.min(maxRight, nw));
      if (rect.width - cl >= minLeft) setPanelW(cl);
    };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging, minLeft, minRight, maxRight, side]);

  const handle = (
    <div
      className={`w-2 cursor-col-resize flex items-center justify-center relative z-10 flex-shrink-0 group transition-colors ${dragging ? "bg-transparent" : ""}`}
      onMouseDown={onDown}>
      <div className={`absolute top-0 bottom-0 left-[3px] w-px bg-[var(--border)] transition-all group-hover:left-[2px] group-hover:w-[3px] group-hover:bg-[var(--accent-blue)] group-hover:shadow-md ${dragging ? "left-[2px] w-[3px] bg-[var(--accent-blue)] shadow-md" : ""}`} />
    </div>
  );

  return (
    <div ref={containerRef} className="flex h-full flex-1 min-h-0 overflow-hidden" style={{ userSelect: dragging ? "none" : "auto" }}>
      {side === "left" ? (
        <>
          <div className="flex flex-col min-h-0 h-full flex-shrink-0 overflow-hidden" style={{ width: panelW, minWidth: minRight, maxWidth: maxRight }}>{left}</div>
          {handle}
          <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden" style={{ minWidth: minLeft }}>{right}</div>
        </>
      ) : (
        <>
          <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden" style={{ minWidth: minLeft }}>{left}</div>
          {handle}
          <div className="flex flex-col min-h-0 h-full flex-shrink-0 overflow-hidden" style={{ width: panelW, minWidth: minRight, maxWidth: maxRight }}>{right}</div>
        </>
      )}
    </div>
  );
}
```

---

## 1.7 SHARED TYPES & CONSTANTS

```typescript
// packages/shared/src/constants.ts
export const FORME_JURIDICE = [
  { cod: "SRL", label: "Societate cu Răspundere Limitată", short: "S.R.L.", group: "SOC" },
  { cod: "SA", label: "Societate pe Acțiuni", short: "S.A.", group: "SOC" },
  { cod: "SNC", label: "Societate în Nume Colectiv", short: "S.N.C.", group: "SOC" },
  { cod: "SCS", label: "Societate în Comandită Simplă", short: "S.C.S.", group: "SOC" },
  { cod: "SCA", label: "Societate în Comandită pe Acțiuni", short: "S.C.A.", group: "SOC" },
  { cod: "PFA", label: "Persoană Fizică Autorizată", short: "P.F.A.", group: "PF" },
  { cod: "II", label: "Întreprindere Individuală", short: "I.I.", group: "PF" },
  { cod: "IF", label: "Întreprindere Familială", short: "I.F.", group: "PF" },
  { cod: "SC", label: "Societate Cooperativă", short: "S.C.", group: "SOC" },
  { cod: "RA", label: "Regie Autonomă", short: "R.A.", group: "SOC" },
  { cod: "SA_BVB", label: "SA listată la bursă", short: "S.A. (BVB)", group: "SOC" },
] as const;

export const SOC_CODES = ["SRL", "SA", "SNC", "SCS", "SCA", "SC", "RA", "SA_BVB"] as const;
export const PF_CODES = ["PFA", "II", "IF"] as const;

export const isSOC = (f: string) => (SOC_CODES as readonly string[]).includes(f);
export const isPF = (f: string) => (PF_CODES as readonly string[]).includes(f);

export const PROJECT_STATUSES = {
  draft: { label: "Ciornă", color: "#5a6478" },
  in_progress: { label: "În lucru", color: "#4d8bff" },
  review: { label: "Verificare", color: "#fbbf24" },
  submitted: { label: "Depus", color: "#34d399" },
  approved: { label: "Aprobat", color: "#34d399" },
  rejected: { label: "Respins", color: "#f87171" },
} as const;

export const DOC_TREE_NODE_DOTS = {
  program: { size: 12, color: "#003399" },
  masura: { size: 8, color: "#C9A84C" },
  sesiune: { size: 6, color: "#888888" },
} as const;

export const DOC_TREE_LEAF_ICONS = {
  ghiduri: "📖",
  templateuri: "📝",
  clienti_prospecti: "🔍",
  clienti_finali: "✅",
} as const;
```

---

## 1.8 PROVIDER ROUTES

```typescript
// apps/api/src/routes/provider.ts
import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import { db } from "../db";
import { providerUsers, cabinetCodes, organizations } from "../db/schema";
import { eq, isNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export const providerRoutes = new Hono();

// Provider auth middleware
const providerAuth = async (c: any, next: any) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  try {
    const payload = await verify(token, process.env.PROVIDER_JWT_SECRET!);
    c.set("providerId", payload.sub);
    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
};

// Login
providerRoutes.post("/auth/login", async (c) => {
  const { email, password } = await c.req.json();
  const user = await db.query.providerUsers.findFirst({ where: eq(providerUsers.email, email) });
  if (!user) return c.json({ error: "Invalid credentials" }, 401);
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return c.json({ error: "Invalid credentials" }, 401);
  const token = await sign({ sub: user.id }, process.env.PROVIDER_JWT_SECRET!);
  return c.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

// List cabinets
providerRoutes.get("/cabinets", providerAuth, async (c) => {
  const cabinets = await db
    .select()
    .from(organizations)
    .orderBy(organizations.createdAt);
  return c.json(cabinets);
});

// Generate code
providerRoutes.post("/codes", providerAuth, async (c) => {
  const body = z.object({
    plan: z.enum(["starter", "professional", "enterprise"]),
    maxUsers: z.number().min(1).max(100),
    trialDays: z.number().min(0).max(90),
  }).parse(await c.req.json());

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const rand = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const code = `DF-${rand}-${new Date().getFullYear()}`;

  const [created] = await db.insert(cabinetCodes).values({
    code,
    plan: body.plan,
    maxUsers: body.maxUsers,
    trialDays: body.trialDays,
    expiresAt: new Date(Date.now() + 90 * 86400000), // 90 zile valabilitate
    createdBy: c.get("providerId"),
  }).returning();

  return c.json(created);
});

// List unused codes
providerRoutes.get("/codes/unused", providerAuth, async (c) => {
  const codes = await db.query.cabinetCodes.findMany({
    where: isNull(cabinetCodes.organizationId),
  });
  return c.json(codes);
});

// Delete code
providerRoutes.delete("/codes/:id", providerAuth, async (c) => {
  const id = c.req.param("id");
  await db.delete(cabinetCodes).where(eq(cabinetCodes.id, id));
  return c.json({ ok: true });
});

// Revenue stats
providerRoutes.get("/revenue", providerAuth, async (c) => {
  // Aggregated stats across all organizations
  const planPrices = { starter: 49, professional: 149, enterprise: 399 };
  const orgs = await db.query.organizations.findMany();
  
  const mrr = orgs
    .filter(o => o.status === "active")
    .reduce((sum, o) => sum + (planPrices[o.plan as keyof typeof planPrices] || 0), 0);
  
  return c.json({
    totalCabinets: orgs.length,
    activeCabinets: orgs.filter(o => o.status === "active").length,
    trialCabinets: orgs.filter(o => o.status === "trial").length,
    mrr,
  });
});
```

---

## 1.9 VARIABILE DE MEDIU

```env
# apps/api/.env
DATABASE_URL=postgresql://user:pass@host:5432/dosarfonduri
REDIS_URL=redis://default:pass@host:6379
JWT_SECRET=your-jwt-secret-min-32-chars
PROVIDER_JWT_SECRET=your-provider-jwt-secret
ANTHROPIC_API_KEY=sk-ant-...
FRONTEND_URL=http://localhost:3000
PORT=8080

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8080
```

---

## 1.10 CHECKLIST FAZA 1

- [ ] Inițializare monorepo (turbo)
- [ ] Setup Next.js 15 cu App Router
- [ ] Setup Hono cu TypeScript
- [ ] Schema Drizzle completă (toate tabelele)
- [ ] Migrări generate și aplicate
- [ ] Conexiune PostgreSQL + Redis
- [ ] Auth routes: signup, login, me, validate-code
- [ ] Auth middleware cu JWT
- [ ] Provider routes: login, cabinets, codes, revenue
- [ ] CSS tokens dark/light
- [ ] ThemeProvider cu context + localStorage
- [ ] Sidebar cu navigare + toggle temă
- [ ] App layout cu sidebar
- [ ] SplitPane componentă reutilizabilă
- [ ] Shared types & constants (forme juridice, statusuri)
- [ ] Login page funcțional (signup wizard 3 pași cu cod cabinet)
- [ ] Provider login + dashboard de bază
- [ ] Ecran "Așteaptă să fii adăugat" pentru users fără cabinet
