-- =====================================================================
-- 0097_nursing_care.sql
-- P2.3 — nursing documentation beyond assignment: care plans (problem → goal →
-- interventions) and SBAR shift handovers, per admission.
-- =====================================================================

CREATE TABLE IF NOT EXISTS nursing_care_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id  UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  problem       TEXT NOT NULL,
  goal          TEXT,
  interventions TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','met','discontinued')),
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_care_plans_admission ON nursing_care_plans (admission_id);

CREATE TABLE IF NOT EXISTS nursing_handovers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_id   UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  shift          TEXT,
  situation      TEXT,
  background     TEXT,
  assessment     TEXT,
  recommendation TEXT,
  author_id      UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_handovers_admission ON nursing_handovers (admission_id, created_at DESC);

ALTER TABLE nursing_care_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE nursing_handovers  ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY care_plans_tenant_all ON nursing_care_plans
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY handovers_tenant_all ON nursing_handovers
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
