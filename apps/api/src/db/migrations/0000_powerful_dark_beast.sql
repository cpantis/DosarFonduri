CREATE TYPE "public"."ai_agent" AS ENUM('solomon', 'neemia', 'ghid_rules', 'ocr');--> statement-breakpoint
CREATE TYPE "public"."associate_type" AS ENUM('pf', 'pj');--> statement-breakpoint
CREATE TYPE "public"."company_status" AS ENUM('functiune', 'radiata', 'dizolvata', 'lichidare');--> statement-breakpoint
CREATE TYPE "public"."doc_file_type" AS ENUM('pdf', 'docx', 'xlsx', 'doc');--> statement-breakpoint
CREATE TYPE "public"."doc_processing_type" AS ENUM('ghid', 'template', 'reference', 'client_doc');--> statement-breakpoint
CREATE TYPE "public"."doc_status" AS ENUM('uploaded', 'processing', 'processed', 'error');--> statement-breakpoint
CREATE TYPE "public"."element_source" AS ENUM('onrc', 'solomon', 'manual', 'calculated', 'ghid');--> statement-breakpoint
CREATE TYPE "public"."eligibility_status" AS ENUM('passed', 'failed', 'pending', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."field_type" AS ENUM('text', 'number', 'textarea', 'date', 'table', 'signature', 'select');--> statement-breakpoint
CREATE TYPE "public"."financial_source" AS ENUM('onrc', 'anaf_upload');--> statement-breakpoint
CREATE TYPE "public"."folder_type" AS ENUM('program', 'masura', 'sesiune', 'ghiduri', 'templateuri', 'clienti_prospecti', 'clienti_finali');--> statement-breakpoint
CREATE TYPE "public"."forma_juridica" AS ENUM('SRL', 'SA', 'SNC', 'SCS', 'SCA', 'PFA', 'II', 'IF', 'SC', 'RA', 'SA_BVB');--> statement-breakpoint
CREATE TYPE "public"."generated_doc_status" AS ENUM('generating', 'generated', 'validated', 'error');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('active', 'trial', 'inactive', 'expired');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('starter', 'professional', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'in_progress', 'review', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."rule_type" AS ENUM('fixed', 'interpreted');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('dark', 'light');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'consultant', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'invited', 'disabled', 'pending_cabinet');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"user_id" uuid,
	"agent" "ai_agent" NOT NULL,
	"model" varchar(100) NOT NULL,
	"tokens_input" integer NOT NULL,
	"tokens_output" integer NOT NULL,
	"cost" numeric(10, 6) NOT NULL,
	"action" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"url" varchar(500) NOT NULL,
	"api_key_encrypted" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"auto_sync" boolean DEFAULT false,
	"sync_interval_days" integer DEFAULT 7,
	"status" varchar(50) DEFAULT 'configured',
	"last_tested_at" timestamp,
	"last_test_result" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cabinet_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"plan" "plan" NOT NULL,
	"max_users" integer DEFAULT 1 NOT NULL,
	"trial_days" integer DEFAULT 30 NOT NULL,
	"organization_id" uuid,
	"activated_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cabinet_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"forma_juridica" "forma_juridica" NOT NULL,
	"denumire" varchar(500) NOT NULL,
	"cui" varchar(20) NOT NULL,
	"reg_com" varchar(30),
	"euid" varchar(50),
	"adresa" text,
	"localitate" varchar(100),
	"judet" varchar(50),
	"cod_postal" varchar(10),
	"telefon" varchar(50),
	"email" varchar(255),
	"website" varchar(255),
	"caen" varchar(10),
	"stare" "company_status" DEFAULT 'functiune' NOT NULL,
	"durata" varchar(50),
	"an_infiintare" integer,
	"capital_social" numeric(15, 2),
	"moneda" varchar(10),
	"parti_sociale" integer,
	"actiuni" integer,
	"valoare_parte" numeric(15, 2),
	"valoare_actiune" numeric(15, 2),
	"natura_capital" jsonb,
	"patrimoniu_afectat" text,
	"reprezentant_if" varchar(255),
	"onrc_raw_data" jsonb,
	"certificat_file_id" uuid,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_administrators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(100),
	"powers" varchar(255),
	"mandate_duration" varchar(50),
	"appointment_date" varchar(20)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_associates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "associate_type" NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(100),
	"citizenship_country" varchar(100),
	"contribution" numeric(15, 2),
	"shares" integer,
	"pct_benefits" numeric(5, 2),
	"pct_losses" numeric(5, 2),
	"tip_asociat" varchar(50)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_financials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"source" "financial_source" NOT NULL,
	"file_id" uuid,
	"f10" jsonb,
	"f20" jsonb,
	"f30" jsonb,
	"f40" jsonb,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_if_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(100),
	"kinship" varchar(100),
	"citizenship" varchar(100),
	"birth_date" varchar(20)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" varchar(255) NOT NULL,
	"type" "folder_type" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(500) NOT NULL,
	"file_type" "doc_file_type" NOT NULL,
	"file_id" uuid NOT NULL,
	"file_size" integer NOT NULL,
	"page_count" integer DEFAULT 0,
	"status" "doc_status" DEFAULT 'uploaded' NOT NULL,
	"processing_type" "doc_processing_type",
	"tags" text[],
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"original_name" varchar(500) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"solomon_model" varchar(100) DEFAULT 'claude-opus-4-6',
	"solomon_et" boolean DEFAULT true,
	"neemia_model" varchar(100) DEFAULT 'claude-sonnet-4-20250514',
	"reguli_fixe_model" varchar(100) DEFAULT 'claude-sonnet-4-20250514',
	"reguli_interp_model" varchar(100) DEFAULT 'claude-opus-4-6',
	"reguli_interp_et" boolean DEFAULT true,
	"review_threshold" numeric(3, 2) DEFAULT '0.85',
	"notif_new_element" boolean DEFAULT true,
	"notif_elig_fail" boolean DEFAULT true,
	"notif_template_ready" boolean DEFAULT true,
	"notif_deadline" boolean DEFAULT true,
	"email_from" varchar(255),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "org_config_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"plan" "plan" DEFAULT 'starter' NOT NULL,
	"max_users" integer DEFAULT 1 NOT NULL,
	"trial_ends_at" timestamp,
	"status" "org_status" DEFAULT 'trial' NOT NULL,
	"provider_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(100) NOT NULL,
	"source" varchar(20) DEFAULT 'manual' NOT NULL,
	"template_id" uuid,
	"done" boolean DEFAULT false NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"template_document_id" uuid NOT NULL,
	"generated_file_id" uuid,
	"status" "generated_doc_status" DEFAULT 'generating' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"pages_completed" integer DEFAULT 0,
	"total_pages" integer DEFAULT 0,
	"filled_count" integer,
	"missing_count" integer,
	"missing_keys" jsonb,
	"generated_by" uuid,
	"validated_by" uuid,
	"validated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_elements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"template_element_id" uuid NOT NULL,
	"value" text,
	"source" "element_source" DEFAULT 'manual' NOT NULL,
	"source_document_id" uuid,
	"confirmed" boolean DEFAULT false NOT NULL,
	"confirmed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_eligibility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"status" "eligibility_status" DEFAULT 'pending' NOT NULL,
	"auto_result" boolean,
	"override_result" boolean,
	"override_by" uuid,
	"notes" text,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"name" varchar(500) NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"valoare" numeric(15, 2),
	"program_finantare" varchar(255),
	"cod_masura" varchar(100),
	"cod_sesiune" varchar(100),
	"cod_nomenclator" varchar(100),
	"prefix_documente" varchar(100),
	"cod_mysmis" varchar(100),
	"structura_dosar" text,
	"consultant_id" uuid NOT NULL,
	"locked_by" uuid,
	"locked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "rule_type" NOT NULL,
	"category" varchar(100),
	"description" text NOT NULL,
	"condition" jsonb,
	"source_page" integer,
	"source_text" text,
	"confidence" numeric(3, 2),
	"validated" boolean DEFAULT false NOT NULL,
	"validated_by" uuid,
	"validated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "solomon_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"model" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "solomon_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"category" varchar(100) NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"source_url" varchar(1000),
	"source_reference" varchar(500),
	"valid_from" timestamp,
	"valid_until" timestamp,
	"priority" integer DEFAULT 0,
	"enabled" boolean DEFAULT true,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "solomon_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"attachments" jsonb,
	"elements_extracted" jsonb,
	"tokens_input" integer,
	"tokens_output" integer,
	"cost" numeric(10, 6),
	"model" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_elements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" varchar(255) NOT NULL,
	"label" varchar(255) NOT NULL,
	"field_type" "field_type" DEFAULT 'text' NOT NULL,
	"page_num" integer,
	"line_num" integer,
	"group" varchar(50),
	"is_repeating" boolean DEFAULT false NOT NULL,
	"row_index" integer,
	"detected" boolean DEFAULT true NOT NULL,
	"validated" boolean DEFAULT false NOT NULL,
	"validated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'consultant' NOT NULL,
	"theme" "theme" DEFAULT 'dark' NOT NULL,
	"status" "user_status" DEFAULT 'pending_cabinet' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_active_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_integrations" ADD CONSTRAINT "api_integrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cabinet_codes" ADD CONSTRAINT "cabinet_codes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cabinet_codes" ADD CONSTRAINT "cabinet_codes_created_by_provider_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."provider_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "companies" ADD CONSTRAINT "companies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "companies" ADD CONSTRAINT "companies_certificat_file_id_files_id_fk" FOREIGN KEY ("certificat_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "companies" ADD CONSTRAINT "companies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_administrators" ADD CONSTRAINT "company_administrators_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_associates" ADD CONSTRAINT "company_associates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_financials" ADD CONSTRAINT "company_financials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_financials" ADD CONSTRAINT "company_financials_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_if_members" ADD CONSTRAINT "company_if_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_parent_id_document_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."document_folders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_document_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."document_folders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_config" ADD CONSTRAINT "org_config_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_checklist" ADD CONSTRAINT "project_checklist_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_checklist" ADD CONSTRAINT "project_checklist_template_id_documents_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_template_document_id_documents_id_fk" FOREIGN KEY ("template_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_generated_file_id_files_id_fk" FOREIGN KEY ("generated_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_elements" ADD CONSTRAINT "project_elements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_elements" ADD CONSTRAINT "project_elements_template_element_id_template_elements_id_fk" FOREIGN KEY ("template_element_id") REFERENCES "public"."template_elements"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_elements" ADD CONSTRAINT "project_elements_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_elements" ADD CONSTRAINT "project_elements_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_eligibility" ADD CONSTRAINT "project_eligibility_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_eligibility" ADD CONSTRAINT "project_eligibility_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_eligibility" ADD CONSTRAINT "project_eligibility_override_by_users_id_fk" FOREIGN KEY ("override_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_folder_id_document_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."document_folders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_consultant_id_users_id_fk" FOREIGN KEY ("consultant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rules" ADD CONSTRAINT "rules_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rules" ADD CONSTRAINT "rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rules" ADD CONSTRAINT "rules_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solomon_conversations" ADD CONSTRAINT "solomon_conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solomon_conversations" ADD CONSTRAINT "solomon_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solomon_knowledge" ADD CONSTRAINT "solomon_knowledge_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solomon_knowledge" ADD CONSTRAINT "solomon_knowledge_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solomon_messages" ADD CONSTRAINT "solomon_messages_conversation_id_solomon_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."solomon_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "template_elements" ADD CONSTRAINT "template_elements_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "template_elements" ADD CONSTRAINT "template_elements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "template_elements" ADD CONSTRAINT "template_elements_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_log_org_idx" ON "ai_usage_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_log_project_idx" ON "ai_usage_log" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_org_idx" ON "audit_log" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cui_org_idx" ON "companies" USING btree ("cui","organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_org_idx" ON "companies" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_year_idx" ON "company_financials" USING btree ("company_id","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folder_org_idx" ON "document_folders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folder_parent_idx" ON "document_folders" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_org_idx" ON "documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_folder_idx" ON "documents" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proj_el_project_idx" ON "project_elements" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_org_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_company_idx" ON "projects" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msg_conv_idx" ON "solomon_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_el_doc_idx" ON "template_elements" USING btree ("document_id");