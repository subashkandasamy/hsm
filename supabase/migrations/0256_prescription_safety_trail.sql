-- F-59 — nothing recorded that a safety warning was shown, or overridden.
--
-- The allergy and interaction banner is computed in the browser.
-- `addPrescription` never learned a warning existed, so when a doctor
-- prescribes amoxicillin to a penicillin-allergic patient the record shows only
-- the prescription. Afterwards there is no way to tell a considered decision
-- from one where nobody looked.
--
-- For an advisory control the override trail IS the control. It is what
-- protects the doctor and the hospital, and it is the only thing that
-- distinguishes "I saw this and had a reason" from "the banner was ignored".
--
-- Three columns:
--
--   safety_warnings       what was computed AT THE TIME, as shown
--   safety_acknowledged   the prescriber said they had read it
--   prescribed_by         who wrote it
--
-- `prescribed_by` is here because the table did not record it at all — the
-- prescription hung off `visits.doctor_id`, which is the visit's doctor and not
-- necessarily the person who typed this line. For an override trail, "who" is
-- half the record.
--
-- The warnings are stored as computed BY THE SERVER, not as sent by the client.
-- `addPrescription` re-runs `checkPrescriptionSafety` itself, so the trail
-- cannot be emptied by a caller that simply declines to mention the warning it
-- was shown. The client is trusted for one thing only — the acknowledgement,
-- which is the human decision and cannot come from anywhere else.
--
-- Deliberately NOT NOT NULL and deliberately no default of '[]': an older row
-- has `safety_warnings IS NULL`, meaning "this predates the trail", which is a
-- different fact from "no warnings were raised". Collapsing the two would
-- invent reassurance about 10 prescriptions nobody checked.

BEGIN;

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS safety_warnings     jsonb,
  ADD COLUMN IF NOT EXISTS safety_acknowledged boolean,
  ADD COLUMN IF NOT EXISTS prescribed_by       uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.prescriptions.safety_warnings IS
  'Allergy/interaction warnings computed server-side when this was prescribed. NULL = written before the trail existed (F-59), which is not the same as none.';
COMMENT ON COLUMN public.prescriptions.safety_acknowledged IS
  'The prescriber confirmed they had read a major warning and were prescribing anyway.';

-- The questions this exists to answer are "which prescriptions carried a major
-- warning" and "which were acknowledged", so the index covers the rows that
-- have a trail at all.
CREATE INDEX IF NOT EXISTS idx_prescriptions_safety
  ON public.prescriptions (tenant_id)
  WHERE safety_warnings IS NOT NULL AND safety_warnings <> '[]'::jsonb;

COMMIT;
