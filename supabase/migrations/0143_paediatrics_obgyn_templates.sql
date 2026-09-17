-- Specialty OPD templates: Paediatrics and Obstetrics & Gynaecology ─────────────
-- Departments pick the consultation template; add the two new ones.
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_clinical_template_check;
ALTER TABLE departments ADD CONSTRAINT departments_clinical_template_check
  CHECK (clinical_template = ANY (ARRAY['general', 'dental', 'ophthalmology', 'paediatrics', 'obgyn']));

-- Growth measured during an OPD visit belongs to that visit (one row per visit,
-- re-saving updates it). visits is partitioned, so no FK — the app scopes it.
ALTER TABLE pediatric_growth ADD COLUMN IF NOT EXISTS visit_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS pediatric_growth_visit_key ON pediatric_growth (visit_id) WHERE visit_id IS NOT NULL;

-- A child's vaccine dose is recorded once.
DELETE FROM patient_immunizations a USING patient_immunizations b
 WHERE a.patient_id = b.patient_id AND a.vaccine = b.vaccine AND a.dose_label = b.dose_label AND a.created_at > b.created_at;
CREATE UNIQUE INDEX IF NOT EXISTS patient_immunizations_dose_key ON patient_immunizations (patient_id, vaccine, dose_label);

-- Birth / neonatal history — recorded once per child, shown on every paediatric visit.
CREATE TABLE IF NOT EXISTS pediatric_profiles (
  patient_id            UUID PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  gestational_age_weeks NUMERIC(4,1),
  birth_weight_kg       NUMERIC(5,3),
  birth_length_cm       NUMERIC(5,1),
  birth_head_circ_cm    NUMERIC(5,1),
  delivery_mode         TEXT CHECK (delivery_mode IN ('normal', 'assisted', 'caesarean')),
  nicu_admission        BOOLEAN,
  neonatal_notes        TEXT,
  feeding               TEXT CHECK (feeding IN ('exclusive_breastfeeding', 'mixed', 'formula', 'complementary', 'family_diet')),
  updated_by            UUID REFERENCES profiles(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE pediatric_profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY pediatric_profiles_tenant_all ON pediatric_profiles FOR ALL
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
REVOKE ALL ON pediatric_profiles FROM anon;

NOTIFY pgrst, 'reload schema';
