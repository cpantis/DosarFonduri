CREATE TABLE IF NOT EXISTS "extraction_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"organization_id" uuid NOT NULL,
	"extraction_type" varchar(50) NOT NULL,
	"result" jsonb NOT NULL,
	"page_count" integer,
	"model_used" varchar(100),
	"tokens_used" integer,
	"processing_time_ms" integer,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "extraction_cache" ADD CONSTRAINT "extraction_cache_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cache_hash_type_idx" ON "extraction_cache" USING btree ("content_hash","extraction_type","organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_org_idx" ON "extraction_cache" USING btree ("organization_id");
