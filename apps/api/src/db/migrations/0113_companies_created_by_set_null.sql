-- 0113: Fix companies.created_by FK to allow user deletion
-- The constraint was ON DELETE NO ACTION, causing errors when deleting users
-- who created companies. Change to ON DELETE SET NULL to match schema.ts.

ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_created_by_users_id_fk";
ALTER TABLE "companies" ADD CONSTRAINT "companies_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
