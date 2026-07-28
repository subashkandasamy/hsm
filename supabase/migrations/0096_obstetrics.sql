-- =====================================================================
-- 0096_obstetrics.sql
-- P2.2 — obstetrics: an antenatal (ANC) record per pregnancy, serial ANC
-- visits, and intrapartum partograph observations.
-- =====================================================================

CREATE TABLE IF NOT EXISTS anc_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lmp             DATE,
  edd             DATE,
  gravida         INT,
  para            INT,
  abortions       INT,
  blood_group     TEXT,
  high_risk       BOOLEAN NOT NULL DEFAULT false,
  high_risk_notes TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','delivered','closed')),
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_anc_patient ON anc_records (patient_id, status);

CREATE TABLE IF NOT EXISTS anc_visits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  anc_id          UUID NOT NULL REFERENCES anc_records(id) ON DELETE CASCADE,
  visit_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg       NUMERIC,
  bp              TEXT,
  pallor          BOOLEAN,
  fundal_height_cm NUMERIC,
  fetal_heart_rate INT,
  fetal_movements TEXT,
  urine_albumin   TEXT,
  urine_sugar     TEXT,
  hb              NUMERIC,
  notes           TEXT,
  recorded_by     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_anc_visits_anc ON anc_visits (anc_id, visit_date);

CREATE TABLE IF NOT EXISTS partograph_obs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  anc_id                UUID NOT NULL REFERENCES anc_records(id) ON DELETE CASCADE,
  admission_id          UUID,
  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  cervix_cm             INT,
  fetal_heart_rate      INT,
  contractions_per10    INT,
  contraction_duration  TEXT,   -- mild/moderate/strong or seconds
  descent               TEXT,
  liquor                TEXT,   -- clear/meconium/absent
  moulding              TEXT,
  bp                    TEXT,
  pulse                 INT,
  temp                  NUMERIC,
  notes                 TEXT,
  recorded_by           UUID REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_partograph_anc ON partograph_obs (anc_id, recorded_at);

ALTER TABLE anc_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE anc_visits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE partograph_obs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY anc_records_tenant_all ON anc_records
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY anc_visits_tenant_all ON anc_visits
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY partograph_tenant_all ON partograph_obs
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
