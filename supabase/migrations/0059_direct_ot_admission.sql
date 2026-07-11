-- Allow IPD admissions without a ward/bed for patients coming directly for OT
ALTER TABLE admissions ALTER COLUMN ward_id DROP NOT NULL;
ALTER TABLE admissions ALTER COLUMN bed_id  DROP NOT NULL;

-- Track that this admission bypassed ward assignment at entry
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS direct_ot BOOLEAN NOT NULL DEFAULT false;
