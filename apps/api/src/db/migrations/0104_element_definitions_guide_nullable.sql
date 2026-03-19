-- Allow elementDefinitions without a guide document (for manually-created elements)
ALTER TABLE "element_definitions" ALTER COLUMN "guide_document_id" DROP NOT NULL;
