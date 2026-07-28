-- =====================================================================
-- 0091_emr_history_problems.sql
-- P1.1 — structured clinical history (past medical/surgical, family, social,
-- drug) held once per patient, plus a coded problem list. Both persist across
-- visits and are shown/edited from the OPD consultation.
-- =====================================================================

CREATE TABLE IF NOT EXISTS patient_history (
  patient_id     UUID PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  past_medical   TEXT,
  past_surgical  TEXT,
  family_history TEXT,
  social_history TEXT,
  drug_history   TEXT,
  updated_by     UUID REFERENCES profiles(id),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patient_problems (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  problem     TEXT NOT NULL,
  icd_code    TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','chronic','resolved')),
  onset_date  DATE,
  noted_by    UUID REFERENCES profiles(id),
  noted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_patient_problems_patient ON patient_problems (patient_id);

ALTER TABLE patient_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_problems ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY patient_history_tenant_all ON patient_history
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY patient_problems_tenant_all ON patient_problems
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
