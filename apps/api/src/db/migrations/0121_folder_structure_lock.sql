-- Migration: Add folder structure lock to organizations
-- Pessimistic lock for folder tree editing (Program → Masura → Sesiune)
-- Does NOT block document uploads, project creation, or document processing

ALTER TABLE organizations
  ADD COLUMN folder_locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN folder_locked_at TIMESTAMP;
