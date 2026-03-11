-- Document Flow Audit fixes: classification persistence, cabinet styling, generation context

-- 1. Document type classification enum + columns on documents
DO $$ BEGIN
  CREATE TYPE "document_type_class" AS ENUM (
    'guide', 'guide_annex_table', 'guide_annex_form',
    'certificat_constatator', 'bilant_anaf', 'contract_arenda',
    'oferta_pret', 'registru_imobilizari', 'declaratie_expert_contabil',
    'document_mediu', 'extras_cont', 'certificat_fiscal',
    'memoriu_template', 'cerere_finantare_template',
    'anexa_b_template', 'anexa_c_template',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "document_type_class" "document_type_class";
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "classification_confidence" numeric(3, 2);

-- 2. Cabinet document style JSONB on organizations
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cabinet_document_style" jsonb;

-- 3. Generation context enum + column on project_documents
DO $$ BEGIN
  CREATE TYPE "generation_context" AS ENUM ('work', 'submission');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "generation_context" "generation_context" DEFAULT 'work';
