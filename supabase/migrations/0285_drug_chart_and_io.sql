-- 0285 — The drug chart's "checked by" and IV bags; the intake/output sheet.
--
-- KMCH's drug chart has a second signature ("checked by") against every dose,
-- and its IV chart a bag number with start and finish times and what was added
-- to the bag. Their intake/output chart is hourly with 6/12/24-hour totals.
--
-- Reuse: doses stay ipd_admin_schedule rows (given_at is the bag's start),
-- fluids stay icu_fluid_balance rows. A finished IV bag writes its volume as
-- an intake row once (source_schedule_id, unique) — the "IV intake from the
-- drip" the nurse no longer adds by hand.

ALTER TABLE ipd_admin_schedule
  ADD COLUMN IF NOT EXISTS checked_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bag_no      text,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

ALTER TABLE ipd_admin_schedule DROP CONSTRAINT IF EXISTS ipd_admin_schedule_finished_check;
ALTER TABLE ipd_admin_schedule ADD CONSTRAINT ipd_admin_schedule_finished_check
  CHECK (finished_at IS NULL OR (given_at IS NOT NULL AND finished_at >= given_at));

ALTER TABLE ipd_medication_orders
  ADD COLUMN IF NOT EXISTS additives text,
  ADD COLUMN IF NOT EXISTS dilution  text;

ALTER TABLE icu_fluid_balance
  ADD COLUMN IF NOT EXISTS site               text,
  ADD COLUMN IF NOT EXISTS source_schedule_id uuid REFERENCES ipd_admin_schedule(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_icu_fluid_from_bag
  ON icu_fluid_balance (source_schedule_id) WHERE source_schedule_id IS NOT NULL;

-- The sheet reads one admission's day at a time.
CREATE INDEX IF NOT EXISTS idx_icu_fluid_admission_time ON icu_fluid_balance (admission_id, recorded_at);

COMMENT ON COLUMN ipd_admin_schedule.checked_by IS 'Second person who checked the dose (KMCH drug chart "checked by"). Never the one who gave it.';
COMMENT ON COLUMN ipd_admin_schedule.bag_no IS 'IV bag number for an infusion; given_at is when the bag was started, finished_at when it ran out.';
COMMENT ON COLUMN icu_fluid_balance.source_schedule_id IS 'Set when the row was written by a finished IV bag — one intake row per bag.';
COMMENT ON COLUMN icu_fluid_balance.site IS 'Which drain / line / tube, e.g. "Right ICD", "Abdominal drain 2".';

NOTIFY pgrst, 'reload schema';
