-- Session-level checklist (document requirements extracted from guides, managed before project creation)
CREATE TABLE IF NOT EXISTS "session_checklist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "folder_id" uuid NOT NULL REFERENCES "document_folders"("id") ON DELETE CASCADE,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" varchar(500) NOT NULL,
  "category" varchar(100) NOT NULL DEFAULT 'General',
  "source" varchar(20) NOT NULL DEFAULT 'manual',
  "source_rule_id" uuid REFERENCES "rules"("id") ON DELETE SET NULL,
  "template_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "notes" text,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "session_checklist_folder_idx" ON "session_checklist" ("folder_id");
CREATE INDEX IF NOT EXISTS "session_checklist_org_idx" ON "session_checklist" ("organization_id");
