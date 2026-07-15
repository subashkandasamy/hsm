-- =====================================================================
-- 0072_insurance_tpa_contacts.sql
-- Richer contact details on TPAs so hospitals can record the person and
-- channels they actually coordinate claims through.
-- =====================================================================

ALTER TABLE insurance_tpas
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS phone          TEXT,
  ADD COLUMN IF NOT EXISTS email          TEXT,
  ADD COLUMN IF NOT EXISTS notes          TEXT;

NOTIFY pgrst, 'reload schema';
