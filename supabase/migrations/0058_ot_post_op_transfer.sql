-- Link OT schedules to IPD admissions (OT is part of IPD flow)
ALTER TABLE ot_schedules
  ADD COLUMN IF NOT EXISTS admission_id UUID REFERENCES admissions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ot_schedules_admission ON ot_schedules(admission_id)
  WHERE admission_id IS NOT NULL;
