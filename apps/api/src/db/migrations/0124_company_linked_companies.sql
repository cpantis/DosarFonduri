-- 0124: Create company_linked_companies table for firme legate analysis
-- Stores connections between companies via shared associates/administrators

CREATE TABLE IF NOT EXISTS "company_linked_companies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "linked_cui" varchar(20) NOT NULL,
  "linked_name" varchar(500) NOT NULL,
  "linked_status" varchar(100),
  "linked_nace" varchar(20),
  "linked_nace_description" varchar(500),
  "linked_county" varchar(100),
  "linked_turnover" decimal(15, 2),
  "linked_profit" decimal(15, 2),
  "linked_employees" integer,
  "person_name" varchar(255) NOT NULL,
  "person_role_main" varchar(100),
  "person_shares_main" decimal(5, 2),
  "person_role_linked" varchar(100),
  "person_shares_linked" decimal(5, 2),
  "risk_score" integer NOT NULL DEFAULT 0,
  "risk_flags" jsonb DEFAULT '[]',
  "source" varchar(50) NOT NULL DEFAULT 'listafirme',
  "confirmed" boolean DEFAULT false,
  "dismissed" boolean DEFAULT false,
  "notes" text,
  "checked_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "linked_company_idx" ON "company_linked_companies" ("company_id");
CREATE INDEX IF NOT EXISTS "linked_org_idx" ON "company_linked_companies" ("organization_id");
CREATE INDEX IF NOT EXISTS "linked_cui_idx" ON "company_linked_companies" ("linked_cui");
