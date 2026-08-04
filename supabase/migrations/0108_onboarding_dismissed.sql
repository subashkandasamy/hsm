-- =====================================================================
-- 0108_onboarding_dismissed.sql
-- "Getting started" setup guide: let an admin dismiss the checklist so it
-- stops showing. Step completion itself is derived live from real data
-- (counts of doctors, lab tests, wards, etc.) — nothing to persist there.
-- =====================================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_dismissed_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
