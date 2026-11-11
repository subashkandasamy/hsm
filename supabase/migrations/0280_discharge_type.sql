-- 0280 — How the patient left: discharge type, and the time and cause of a death.
--
-- Before this, a discharge was one free-text summary. A death, a patient taken
-- home against medical advice and one who walked out unnoticed all looked like
-- a normal recovery on the record, the printout and the IPD list.
--
-- Older discharges keep NULL ("not recorded"); the app requires a type for
-- every new one, so no backfill guess is made here.

ALTER TABLE admissions
  ADD COLUMN IF NOT EXISTS discharge_type text,
  ADD COLUMN IF NOT EXISTS death_at       timestamptz,
  ADD COLUMN IF NOT EXISTS death_cause    text;

ALTER TABLE admissions DROP CONSTRAINT IF EXISTS admissions_discharge_type_check;
ALTER TABLE admissions ADD CONSTRAINT admissions_discharge_type_check
  CHECK (discharge_type IS NULL OR discharge_type = ANY (ARRAY['normal', 'referred', 'dama', 'absconded', 'death']));

-- A death is recorded with its time; nothing else carries one.
ALTER TABLE admissions DROP CONSTRAINT IF EXISTS admissions_death_fields_check;
ALTER TABLE admissions ADD CONSTRAINT admissions_death_fields_check
  CHECK (
    (discharge_type = 'death' AND death_at IS NOT NULL)
    OR (discharge_type IS DISTINCT FROM 'death' AND death_at IS NULL AND death_cause IS NULL)
  );

COMMENT ON COLUMN admissions.discharge_type IS
  'How the patient left: normal, referred, dama (against medical advice), absconded, death. NULL on discharges recorded before 0280.';
COMMENT ON COLUMN admissions.death_at IS 'Time of death, when discharge_type = death.';
COMMENT ON COLUMN admissions.death_cause IS 'Cause of death as written by the doctor, when discharge_type = death.';

NOTIFY pgrst, 'reload schema';
