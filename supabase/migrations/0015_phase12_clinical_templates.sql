-- ============================================================
-- Phase 12: Specialty Clinical Templates (Department-Based)
-- ============================================================

-- 1. Add clinical_template to departments
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS clinical_template text NOT NULL DEFAULT 'general'
  CHECK (clinical_template IN ('general', 'dental', 'ophthalmology'));

-- 2. Add enabled_modules to tenants (module visibility, admin-controlled)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS enabled_modules jsonb NOT NULL DEFAULT
  '["ipd","emergency","bloodbank","ot","lab","radiology","pharmacy","insurance","inventory","hr"]'::jsonb;

-- 3. Additive structured clinical data per visit
ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS clinical_data jsonb;

-- ===== Dental Tables =====

CREATE TABLE IF NOT EXISTS patient_dental_chart (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  patient_id  uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tooth_number int NOT NULL CHECK (tooth_number BETWEEN 1 AND 32),
  current_status text NOT NULL DEFAULT 'healthy'
    CHECK (current_status IN ('healthy','decayed','filled','crowned','root_canal','missing','extracted','implant')),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (patient_id, tooth_number)
);

CREATE TABLE IF NOT EXISTS dental_treatments (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  visit_id        uuid NOT NULL,   -- app-enforced; visits is partitioned so no DB FK
  patient_id      uuid NOT NULL REFERENCES patients(id),
  tooth_number    int  CHECK (tooth_number BETWEEN 1 AND 32),
  procedure       text NOT NULL,
  notes           text,
  price_snapshot  numeric NOT NULL DEFAULT 0,
  billing_status  text NOT NULL DEFAULT 'unbilled'
    CHECK (billing_status IN ('unbilled','billed')),
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dental_recalls (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  patient_id  uuid NOT NULL REFERENCES patients(id),
  recall_date date NOT NULL,
  reason      text,
  status      text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','notified','completed','cancelled')),
  created_at  timestamptz DEFAULT now()
);

-- ===== RLS =====

ALTER TABLE patient_dental_chart ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_treatments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_recalls       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON patient_dental_chart
  USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON dental_treatments
  USING (tenant_id = current_tenant_id());
CREATE POLICY "tenant_isolation" ON dental_recalls
  USING (tenant_id = current_tenant_id());

-- ===== Indexes =====

CREATE INDEX IF NOT EXISTS idx_dental_chart_patient
  ON patient_dental_chart (patient_id);
CREATE INDEX IF NOT EXISTS idx_dental_treatments_visit
  ON dental_treatments (visit_id);
CREATE INDEX IF NOT EXISTS idx_dental_treatments_patient
  ON dental_treatments (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dental_recalls_patient
  ON dental_recalls (patient_id, recall_date);
CREATE INDEX IF NOT EXISTS idx_dental_recalls_date
  ON dental_recalls (recall_date) WHERE status = 'pending';
