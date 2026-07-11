-- Add body_part to radiology_catalog so tenant procedures can be grouped
-- identically to the master catalog (body_part within modality).
ALTER TABLE radiology_catalog
  ADD COLUMN IF NOT EXISTS body_part TEXT NOT NULL DEFAULT 'General';
