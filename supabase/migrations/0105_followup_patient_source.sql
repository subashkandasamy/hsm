-- =====================================================================
-- 0105_followup_patient_source.sql
-- Patient portal Phase 4: let a patient REQUEST an appointment from the portal.
-- A patient request reuses the existing follow-up queue (follow_ups) so it lands
-- in the hospital's Follow-ups tab for the front desk to confirm & convert into
-- a real appointment — no auto-booked appointment, no premature consultation
-- bill. Add 'patient' to the source enum.
-- =====================================================================

ALTER TABLE follow_ups DROP CONSTRAINT IF EXISTS follow_ups_source_check;
ALTER TABLE follow_ups ADD  CONSTRAINT follow_ups_source_check
  CHECK (source IN ('opd', 'ipd', 'manual', 'patient'));

NOTIFY pgrst, 'reload schema';
