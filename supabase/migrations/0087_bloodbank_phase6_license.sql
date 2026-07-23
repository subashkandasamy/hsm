-- =====================================================================
-- 0087_bloodbank_phase6_license.sql
-- Blood Bank v2 — Phase 6: store the blood bank licence number on the tenant
-- profile (shown on reports / registers for regulatory compliance).
-- =====================================================================

ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS blood_bank_license TEXT;

NOTIFY pgrst, 'reload schema';
