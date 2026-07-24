-- =====================================================================
-- 0088_ipd_care_team_doctor_visits.sql
-- IPD P0.1 — multi-doctor care team + doctor visits/consults with per-visit
-- billing. An admission can now have many doctors (attending + consultants,
-- physiotherapist, dietitian, psychiatrist…), each visit recorded and — for
-- non-attending doctors — billed at their own consultation fee.
-- =====================================================================

CREATE TABLE IF NOT EXISTS admission_care_team (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  doctor_id    UUID NOT NULL REFERENCES profiles(id),
  role         TEXT NOT NULL DEFAULT 'consultant'
               CHECK (role IN ('attending','consultant','anaesthetist','physiotherapist','dietitian','psychiatrist','other')),
  added_by     UUID REFERENCES profiles(id),
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_care_team_admission ON admission_care_team (admission_id) WHERE removed_at IS NULL;
-- One active membership per doctor per admission
CREATE UNIQUE INDEX IF NOT EXISTS uq_care_team_active ON admission_care_team (admission_id, doctor_id) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS doctor_visits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id   UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  doctor_id      UUID NOT NULL REFERENCES profiles(id),
  visit_type     TEXT NOT NULL DEFAULT 'consult' CHECK (visit_type IN ('round','consult','procedure')),
  status         TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('requested','completed','cancelled')),
  reason         TEXT,
  note           TEXT,
  fee_snapshot   NUMERIC,
  billing_status TEXT NOT NULL DEFAULT 'unbilled' CHECK (billing_status IN ('unbilled','billed','waived')),
  visit_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  requested_by   UUID REFERENCES profiles(id),
  completed_by   UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_doctor_visits_admission ON doctor_visits (admission_id);
CREATE INDEX IF NOT EXISTS idx_doctor_visits_worklist ON doctor_visits (doctor_id, status) WHERE status = 'requested';

ALTER TABLE admission_care_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_visits       ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY care_team_tenant_all ON admission_care_team
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY doctor_visits_tenant_all ON doctor_visits
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow 'consultation' as a bills.bill_source so a doctor visit auto-bills onto
-- a per-day consultation bill on the admission (via autoIpdBill).
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_source_check;
ALTER TABLE bills ADD CONSTRAINT bills_bill_source_check
  CHECK (bill_source IN (
    'bed', 'lab', 'radiology', 'ipd_pharmacy',
    'nursing', 'nursing_morning', 'nursing_night',
    'consolidated', 'advance_refund', 'appointment_refund',
    'ot', 'blood', 'consultation'
  ));

NOTIFY pgrst, 'reload schema';
