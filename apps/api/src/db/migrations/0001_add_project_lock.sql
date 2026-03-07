-- Add project locking columns for concurrent access control
ALTER TABLE projects ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP;
