-- =====================================================================
-- 0100_follow_ups.sql
-- Follow-up requests: a soft "come back for a review" intent, separate from
-- an appointment. A doctor (OPD consult / IPD discharge) or staff (manual)
-- creates a pending request; the front desk later confirms with the patient
-- and CONVERTS it into a real appointment (which is what books the slot and
-- raises the consultation bill). This stops appointment bookings — and their
-- consultation bill — from being created for follow-ups the patient hasn't
-- confirmed yet.
--
-- Note: source_visit_id / source_admission_id / appointment_id are stored as
-- plain UUIDs (no FK) because visits & appointments are PARTITIONED tables,
-- matching how `bills` links to them.
-- =====================================================================

CREATE TABLE IF NOT EXISTS follow_ups (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  patient_id           UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  -- Where the request came from (drives OPD vs IPD labelling on the tab)
  source               TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('opd','ipd','manual')),
  source_visit_id      UUID,   -- OPD visit it was recommended from (partitioned table → no FK)
  source_admission_id  UUID REFERENCES admissions(id) ON DELETE SET NULL,
  -- Who recommended it, and who should see the patient (editable at convert)
  recommended_by       UUID REFERENCES profiles(id),
  suggested_doctor_id  UUID REFERENCES profiles(id),
  suggested_date       DATE,   -- advisory only; convert on any date
  reason               TEXT,
  note                 TEXT,
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','converted','cancelled')),
  appointment_id       UUID,   -- set on convert (partitioned table → no FK)
  created_by           UUID REFERENCES profiles(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at         TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ
);

-- Tab default is pending, filterable by status/date; index the common lookups.
CREATE INDEX IF NOT EXISTS idx_follow_ups_tenant_status ON follow_ups (tenant_id, status, suggested_date);
CREATE INDEX IF NOT EXISTS idx_follow_ups_patient       ON follow_ups (patient_id);

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY follow_ups_tenant_all ON follow_ups
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
