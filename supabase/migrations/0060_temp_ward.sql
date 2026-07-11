-- Overflow / temporary wards: unlimited capacity, beds created on-demand at admission
ALTER TABLE wards ADD COLUMN IF NOT EXISTS is_temp BOOLEAN NOT NULL DEFAULT false;
