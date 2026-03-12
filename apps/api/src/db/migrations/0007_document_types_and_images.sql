-- Migration: Add missing document types and image file support
-- Related to: docs_example audit — support for CI, diploma, act constitutiv, statut, etc.

-- Add new document type classifications
ALTER TYPE "document_type_class" ADD VALUE IF NOT EXISTS 'carte_identitate';
ALTER TYPE "document_type_class" ADD VALUE IF NOT EXISTS 'diploma_studii';
ALTER TYPE "document_type_class" ADD VALUE IF NOT EXISTS 'act_constitutiv';
ALTER TYPE "document_type_class" ADD VALUE IF NOT EXISTS 'statut';
ALTER TYPE "document_type_class" ADD VALUE IF NOT EXISTS 'descriere_proiect';
ALTER TYPE "document_type_class" ADD VALUE IF NOT EXISTS 'adeverinta';
ALTER TYPE "document_type_class" ADD VALUE IF NOT EXISTS 'foto_echipament';

-- Add image file types for equipment photos
ALTER TYPE "doc_file_type" ADD VALUE IF NOT EXISTS 'png';
ALTER TYPE "doc_file_type" ADD VALUE IF NOT EXISTS 'jpg';
