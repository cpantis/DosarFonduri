-- Add "factura" to the document_type_class enum
ALTER TYPE "document_type_class" ADD VALUE IF NOT EXISTS 'factura';
