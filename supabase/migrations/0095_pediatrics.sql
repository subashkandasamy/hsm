-- =====================================================================
-- 0095_pediatrics.sql
-- P2.1 — pediatrics: serial growth measurements + immunization schedule.
-- immunization_schedule is global reference (India UIP-style, due age in days);
-- patient_immunizations records doses given.
-- =====================================================================

CREATE TABLE IF NOT EXISTS pediatric_growth (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  recorded_at   DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg     NUMERIC,
  height_cm     NUMERIC,
  head_circ_cm  NUMERIC,
  muac_cm       NUMERIC,
  notes         TEXT,
  recorded_by   UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ped_growth_patient ON pediatric_growth (patient_id, recorded_at);

CREATE TABLE IF NOT EXISTS immunization_schedule (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vaccine      TEXT NOT NULL,
  dose_label   TEXT NOT NULL,
  due_age_days INT NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0
);
ALTER TABLE immunization_schedule ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY immunization_schedule_read ON immunization_schedule FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS patient_immunizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  vaccine     TEXT NOT NULL,
  dose_label  TEXT NOT NULL,
  given_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT,
  given_by    UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patient_immun_patient ON patient_immunizations (patient_id);

ALTER TABLE pediatric_growth      ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_immunizations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY ped_growth_tenant_all ON pediatric_growth
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY patient_immun_tenant_all ON patient_immunizations
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- India National Immunization Schedule (UIP) — common set.
INSERT INTO immunization_schedule (vaccine, dose_label, due_age_days, sort_order) VALUES
('BCG','Birth',0,1),
('OPV','0 (Birth)',0,2),
('Hepatitis B','Birth',0,3),
('OPV','1',42,10),
('Pentavalent (DPT-HepB-Hib)','1',42,11),
('Rotavirus','1',42,12),
('PCV','1',42,13),
('IPV','1',42,14),
('OPV','2',70,20),
('Pentavalent (DPT-HepB-Hib)','2',70,21),
('Rotavirus','2',70,22),
('OPV','3',98,30),
('Pentavalent (DPT-HepB-Hib)','3',98,31),
('Rotavirus','3',98,32),
('PCV','2',98,33),
('IPV','2',98,34),
('Measles / MR','1',270,40),
('PCV','Booster',270,41),
('JE','1',270,42),
('Vitamin A','1',270,43),
('DPT','Booster 1',480,50),
('OPV','Booster',480,51),
('Measles / MR','2',480,52),
('JE','2',480,53),
('DPT','Booster 2',1825,60),
('Tetanus (Td)','10 years',3650,70)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
