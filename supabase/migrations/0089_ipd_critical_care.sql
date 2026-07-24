-- =====================================================================
-- 0089_ipd_critical_care.sql
-- IPD P0.2 — ICU / critical-care. Adds critical-care flags on the admission,
-- an ICU flow sheet (time-stamped observations), an intake/output (fluid
-- balance) chart, and ICU/ventilator daily charges.
-- =====================================================================

-- Critical-care flags on the admission
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS is_critical_care BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS on_ventilator    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS code_status      TEXT;   -- full | dnr | dni | comfort
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS isolation        TEXT;   -- none | contact | droplet | airborne

DO $$ BEGIN
  ALTER TABLE admissions ADD CONSTRAINT admissions_code_status_chk
    CHECK (code_status IS NULL OR code_status IN ('full','dnr','dni','comfort'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE admissions ADD CONSTRAINT admissions_isolation_chk
    CHECK (isolation IS NULL OR isolation IN ('none','contact','droplet','airborne'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ICU flow sheet — one row per observation time-point
CREATE TABLE IF NOT EXISTS icu_observations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id  UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by   UUID REFERENCES profiles(id),
  -- Haemodynamics / respiratory
  hr INT, sbp INT, dbp INT, map INT, cvp INT, spo2 INT, rr INT, temp NUMERIC,
  -- Neuro / sedation / pain
  gcs_e INT, gcs_v INT, gcs_m INT, gcs_total INT, rass INT, pain_score INT,
  -- Ventilator
  vent_mode TEXT, fio2 INT, peep INT, tidal_volume INT, vent_rate INT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_icu_obs_admission ON icu_observations (admission_id, recorded_at DESC);

-- Intake / output (fluid balance)
CREATE TABLE IF NOT EXISTS icu_fluid_balance (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by  UUID REFERENCES profiles(id),
  direction    TEXT NOT NULL CHECK (direction IN ('intake','output')),
  category     TEXT NOT NULL,   -- iv | oral | ng | blood | urine | drain | vomit | stool | other
  volume_ml    INT NOT NULL CHECK (volume_ml >= 0),
  notes        TEXT
);
CREATE INDEX IF NOT EXISTS idx_icu_fluid_admission ON icu_fluid_balance (admission_id, recorded_at DESC);

ALTER TABLE icu_observations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE icu_fluid_balance ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY icu_obs_tenant_all ON icu_observations
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY icu_fluid_tenant_all ON icu_fluid_balance
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ICU / ventilator daily charges (config)
ALTER TABLE ipd_billing_config ADD COLUMN IF NOT EXISTS icu_charge_per_day        NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE ipd_billing_config ADD COLUMN IF NOT EXISTS ventilator_charge_per_day NUMERIC NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
