-- =====================================================================
-- 0081_bloodbank_phase1_encounter_billing.sql
-- Blood Bank v2 — Phase 1: link blood requests to the encounter they are
-- raised for (IPD admission / OT schedule / OPD visit), capture clinical
-- urgency + indication, and introduce a per-component processing charge so
-- issued blood is priced from configuration (India: a processing/service
-- charge per component, not a sale).
--
-- Conventions: non-partitioned, tenant-scoped (tenant_id + FK). No hard FK to
-- the partitioned `visits` table — plain UUID resolved at the app layer, same
-- as bills.visit_id / admissions.source_visit_id.
-- =====================================================================

-- 1. Encounter linkage + clinical context on blood_requests -----------------
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS admission_id   UUID REFERENCES admissions(id);
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS ot_schedule_id UUID REFERENCES ot_schedules(id);
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS visit_id       UUID;
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS urgency        TEXT NOT NULL DEFAULT 'routine';
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS indication     TEXT;
ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS required_by    TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE blood_requests ADD CONSTRAINT blood_requests_urgency_chk
    CHECK (urgency IN ('routine','urgent','emergency'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_blood_requests_admission
  ON blood_requests (admission_id) WHERE admission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blood_requests_ot
  ON blood_requests (ot_schedule_id) WHERE ot_schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blood_requests_visit
  ON blood_requests (visit_id) WHERE visit_id IS NOT NULL;

-- 2. Per-component processing charge (configurable per tenant) ---------------
CREATE TABLE IF NOT EXISTS blood_component_charges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  component  TEXT NOT NULL CHECK (component IN ('whole','prbc','plasma','platelets')),
  price      NUMERIC NOT NULL DEFAULT 0 CHECK (price >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, component)
);

ALTER TABLE blood_component_charges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY blood_component_charges_tenant_all ON blood_component_charges
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
