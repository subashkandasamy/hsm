-- Vaccination: UIP age limits, dose order and gaps; one action per vaccine ─────
-- Source: MoHFW Universal Immunization Programme — National Immunization Schedule
-- (with fIPV third dose, 2023) and UIP operational guidelines on upper age limits.

ALTER TABLE immunization_schedule ADD COLUMN IF NOT EXISTS min_age_days      INT;
ALTER TABLE immunization_schedule ADD COLUMN IF NOT EXISTS max_age_days      INT;
ALTER TABLE immunization_schedule ADD COLUMN IF NOT EXISTS prev_vaccine      TEXT;
ALTER TABLE immunization_schedule ADD COLUMN IF NOT EXISTS prev_dose_label   TEXT;
ALTER TABLE immunization_schedule ADD COLUMN IF NOT EXISTS min_interval_days INT;
ALTER TABLE immunization_schedule ADD COLUMN IF NOT EXISTS note              TEXT;

-- Doses missing from the original list.
INSERT INTO immunization_schedule (vaccine, dose_label, due_age_days, sort_order)
SELECT v.vaccine, v.dose_label, v.due, v.sort FROM (VALUES
  ('IPV', '3', 270, 44),
  ('Vitamin A', '2', 487, 54),
  ('Vitamin A', '3', 670, 55),
  ('Vitamin A', '4', 852, 56),
  ('Vitamin A', '5', 1035, 57),
  ('Vitamin A', '6', 1218, 58),
  ('Vitamin A', '7', 1400, 59),
  ('Vitamin A', '8', 1583, 61),
  ('Vitamin A', '9', 1765, 62),
  ('Tetanus (Td)', '16 years', 5844, 71)
) AS v(vaccine, dose_label, due, sort)
WHERE NOT EXISTS (SELECT 1 FROM immunization_schedule s WHERE s.vaccine = v.vaccine AND s.dose_label = v.dose_label);

CREATE UNIQUE INDEX IF NOT EXISTS immunization_schedule_dose_key ON immunization_schedule (vaccine, dose_label);

-- Rules per dose: (vaccine, dose, earliest age, upper age limit, previous dose, minimum gap, note)
UPDATE immunization_schedule s SET
  min_age_days = r.min_age, max_age_days = r.max_age, prev_vaccine = r.prev_v, prev_dose_label = r.prev_d,
  min_interval_days = r.gap, note = r.note
FROM (VALUES
  ('BCG', 'Birth', 0, 365, NULL, NULL, NULL, 'Can be given up to 1 year of age'),
  ('OPV', '0 (Birth)', 0, 15, NULL, NULL, NULL, 'Only within the first 15 days of life'),
  ('Hepatitis B', 'Birth', 0, 1, NULL, NULL, NULL, 'Only within 24 hours of birth'),
  ('OPV', '1', 42, 1825, NULL, NULL, NULL, 'Up to 5 years of age'),
  ('OPV', '2', 70, 1825, 'OPV', '1', 28, 'Up to 5 years of age'),
  ('OPV', '3', 98, 1825, 'OPV', '2', 28, 'Up to 5 years of age'),
  ('Pentavalent (DPT-HepB-Hib)', '1', 42, 365, NULL, NULL, NULL, 'Up to 1 year of age; after that give DPT instead'),
  ('Pentavalent (DPT-HepB-Hib)', '2', 70, 365, 'Pentavalent (DPT-HepB-Hib)', '1', 28, 'Up to 1 year of age; after that give DPT instead'),
  ('Pentavalent (DPT-HepB-Hib)', '3', 98, 365, 'Pentavalent (DPT-HepB-Hib)', '2', 28, 'Up to 1 year of age; after that give DPT instead'),
  ('Rotavirus', '1', 42, 365, NULL, NULL, NULL, 'Up to 1 year of age'),
  ('Rotavirus', '2', 70, 365, 'Rotavirus', '1', 28, 'Up to 1 year of age'),
  ('Rotavirus', '3', 98, 365, 'Rotavirus', '2', 28, 'Up to 1 year of age'),
  ('PCV', '1', 42, 365, NULL, NULL, NULL, 'Up to 1 year of age'),
  ('PCV', '2', 98, 365, 'PCV', '1', 56, 'Up to 1 year of age'),
  ('PCV', 'Booster', 270, 730, 'PCV', '2', 56, 'At 9–12 months; catch-up up to 2 years'),
  ('IPV', '1', 42, 365, NULL, NULL, NULL, 'Fractional IPV, up to 1 year of age'),
  ('IPV', '2', 98, 365, 'IPV', '1', 28, 'Fractional IPV, up to 1 year of age'),
  ('IPV', '3', 270, 365, 'IPV', '2', 28, 'Fractional IPV at 9 months, up to 1 year of age'),
  ('Measles / MR', '1', 270, 1825, NULL, NULL, NULL, 'Up to 5 years of age'),
  ('Measles / MR', '2', 480, 1825, 'Measles / MR', '1', 28, 'Up to 5 years of age'),
  ('JE', '1', 270, 5475, NULL, NULL, NULL, 'Endemic districts; up to 15 years of age'),
  ('JE', '2', 480, 5475, 'JE', '1', 28, 'Endemic districts; up to 15 years of age'),
  ('Vitamin A', '1', 270, 1825, NULL, NULL, NULL, 'With MR 1 at 9 months'),
  ('Vitamin A', '2', 487, 1825, 'Vitamin A', '1', 180, 'Every 6 months up to 5 years'),
  ('Vitamin A', '3', 670, 1825, 'Vitamin A', '2', 180, 'Every 6 months up to 5 years'),
  ('Vitamin A', '4', 852, 1825, 'Vitamin A', '3', 180, 'Every 6 months up to 5 years'),
  ('Vitamin A', '5', 1035, 1825, 'Vitamin A', '4', 180, 'Every 6 months up to 5 years'),
  ('Vitamin A', '6', 1218, 1825, 'Vitamin A', '5', 180, 'Every 6 months up to 5 years'),
  ('Vitamin A', '7', 1400, 1825, 'Vitamin A', '6', 180, 'Every 6 months up to 5 years'),
  ('Vitamin A', '8', 1583, 1825, 'Vitamin A', '7', 180, 'Every 6 months up to 5 years'),
  ('Vitamin A', '9', 1765, 1825, 'Vitamin A', '8', 180, 'Every 6 months up to 5 years'),
  ('DPT', 'Booster 1', 480, 2555, 'Pentavalent (DPT-HepB-Hib)', '3', 180, 'At 16–24 months; up to 7 years of age'),
  ('OPV', 'Booster', 480, 1825, 'OPV', '3', 180, 'At 16–24 months; up to 5 years of age'),
  ('DPT', 'Booster 2', 1825, 2555, 'DPT', 'Booster 1', 180, 'At 5–6 years; up to 7 years of age'),
  ('Tetanus (Td)', '10 years', 3650, NULL, NULL, NULL, NULL, 'At 10 years'),
  ('Tetanus (Td)', '16 years', 5844, NULL, 'Tetanus (Td)', '10 years', 1825, 'At 16 years')
) AS r(vaccine, dose, min_age, max_age, prev_v, prev_d, gap, note)
WHERE s.vaccine = r.vaccine AND s.dose_label = r.dose;

-- Doses recorded from the child's card without an exact date.
ALTER TABLE patient_immunizations ADD COLUMN IF NOT EXISTS date_known BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE patient_immunizations ADD COLUMN IF NOT EXISTS visit_id UUID;
UPDATE patient_immunizations SET date_known = false WHERE notes = 'Given earlier — exact date not recorded' AND date_known;
CREATE INDEX IF NOT EXISTS idx_patient_immun_given_on ON patient_immunizations (tenant_id, given_date);

-- A due dose not given at a visit, and why (fever, refused, out of stock).
CREATE TABLE IF NOT EXISTS patient_immunization_deferrals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  vaccine     TEXT NOT NULL,
  dose_label  TEXT NOT NULL,
  reason      TEXT NOT NULL,
  deferred_on DATE NOT NULL,
  visit_id    UUID,
  recorded_by UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_immun_deferrals_patient ON patient_immunization_deferrals (patient_id, created_at DESC);
ALTER TABLE patient_immunization_deferrals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY patient_immunization_deferrals_tenant_all ON patient_immunization_deferrals FOR ALL
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
REVOKE ALL ON patient_immunization_deferrals FROM anon;

-- The child's past vaccinations were checked against their card (first visit).
ALTER TABLE pediatric_profiles ADD COLUMN IF NOT EXISTS vaccine_history_reviewed_at TIMESTAMPTZ;

-- Optional clinic preference: warn when more than N vaccines are given to a child in a day.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS vaccine_daily_warn_limit INT CHECK (vaccine_daily_warn_limit BETWEEN 1 AND 20);

NOTIFY pgrst, 'reload schema';
