-- Enhance ot_rooms with type, location, status, and notes
ALTER TABLE ot_rooms ADD COLUMN IF NOT EXISTS ot_type  TEXT;
ALTER TABLE ot_rooms ADD COLUMN IF NOT EXISTS floor    TEXT;
ALTER TABLE ot_rooms ADD COLUMN IF NOT EXISTS block    TEXT;
ALTER TABLE ot_rooms ADD COLUMN IF NOT EXISTS notes    TEXT;
ALTER TABLE ot_rooms ADD COLUMN IF NOT EXISTS status   TEXT NOT NULL DEFAULT 'active';

-- Sync existing rows so status matches is_active
UPDATE ot_rooms SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END;
