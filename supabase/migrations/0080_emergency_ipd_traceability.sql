-- =====================================================================
-- 0080_emergency_ipd_traceability.sql
-- Link an IPD admission back to the Emergency case it was admitted from,
-- mirroring admissions.source_visit_id (0073). This gives a direct
-- Emergency→IPD trail even when the ER patient was admitted straight from
-- triage without a consultation visit.
--
-- No hard FK to keep parity with the existing source_visit_id convention
-- (plain UUID, resolved at the application layer). emergency_cases does have
-- a real PK, but we stay consistent with the sibling column's style.
-- =====================================================================

ALTER TABLE admissions
  ADD COLUMN IF NOT EXISTS source_emergency_case_id UUID;

CREATE INDEX IF NOT EXISTS idx_admissions_source_emergency_case
  ON admissions (source_emergency_case_id)
  WHERE source_emergency_case_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
