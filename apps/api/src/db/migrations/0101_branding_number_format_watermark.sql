-- 0101: Extend cabinet_document_style with numberFormat + draftWatermark
-- These fields are stored inside the existing JSONB column, so no ALTER TABLE needed.
-- This migration just adds a comment documenting the new fields.

COMMENT ON COLUMN organizations.cabinet_document_style IS
  'Cabinet branding for document generation. Fields: primaryColor, accentColor, fontFamily, logoUrl, footerText, highlightColor, warningColor, logoOnWorkDocs, logoOnFinalDocs, numberFormat (ro|en), draftWatermark (bool), draftWatermarkText (string)';
