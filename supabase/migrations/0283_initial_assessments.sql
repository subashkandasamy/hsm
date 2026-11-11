-- 0283 — The Initial Evaluation: one form, filled in the ER or on admission.
--
-- KMCH's paper IP file opens with a 4-page "ER Initial Evaluation Record":
-- arrival and pre-hospital care, the primary survey (airway, breathing,
-- circulation, disability, exposure), SAMPLE history, eFAST, a secondary
-- survey, a burns chart, diagnosis and plan, treatment given in the ER and the
-- shifting note. Uyirly had none of it — an ER visit opened the OPD screen with
-- whichever department template the doctor happened to belong to.
--
-- One table, two settings. Filled in the ER it belongs to the case
-- (emergency_case_id); when that patient is admitted it is linked to the
-- admission and becomes the first page of the IP file — nobody writes it twice.
-- A patient admitted from OPD gets the same form without the ER-only sections.
--
-- Sections are JSON (shapes in src/lib/initialAssessment.ts) because the form
-- will grow with use. What other tables already hold is not copied in: history
-- stays in patient_history, allergies in patient_allergies; arrival vitals are
-- also written as the stay's first icu_observations row (observation_id) so
-- they start the vitals chart.

CREATE TABLE IF NOT EXISTS initial_assessments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id        uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  emergency_case_id uuid REFERENCES emergency_cases(id) ON DELETE SET NULL,
  admission_id      uuid REFERENCES admissions(id) ON DELETE SET NULL,
  setting           text NOT NULL CHECK (setting IN ('er', 'ipd')),
  data              jsonb NOT NULL DEFAULT '{}'::jsonb,
  observation_id    uuid REFERENCES icu_observations(id) ON DELETE SET NULL,
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT initial_assessments_has_owner CHECK (emergency_case_id IS NOT NULL OR admission_id IS NOT NULL)
);

-- One evaluation per ER case and per admission.
CREATE UNIQUE INDEX IF NOT EXISTS idx_initial_assessments_case
  ON initial_assessments (emergency_case_id) WHERE emergency_case_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_initial_assessments_admission
  ON initial_assessments (admission_id) WHERE admission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_initial_assessments_tenant_patient
  ON initial_assessments (tenant_id, patient_id);

ALTER TABLE initial_assessments ENABLE ROW LEVEL SECURITY;

-- Clinical findings: the clinical roles only, active staff of this hospital
-- (current_active_role checks both) — not the tenant-only rule most older
-- clinical tables have (see the RLS audit, F5).
DROP POLICY IF EXISTS initial_assessments_clinical ON initial_assessments;
CREATE POLICY initial_assessments_clinical ON initial_assessments
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) IN ('admin', 'doctor', 'nurse'))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) IN ('admin', 'doctor', 'nurse'));

REVOKE ALL ON initial_assessments FROM anon;

COMMENT ON TABLE initial_assessments IS
  'The Initial Evaluation (KMCH ER Initial Evaluation Record): one per ER case and/or admission. Filled in the ER it follows the patient into IPD. Section shapes: src/lib/initialAssessment.ts.';

NOTIFY pgrst, 'reload schema';
