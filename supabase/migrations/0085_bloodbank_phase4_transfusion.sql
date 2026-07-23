-- =====================================================================
-- 0085_bloodbank_phase4_transfusion.sql
-- Blood Bank v2 — Phase 4: bedside transfusion administration record +
-- adverse-reaction (haemovigilance) reporting. A transfusion is recorded
-- against a specific issued unit (blood_issues row); reactions link to it.
-- =====================================================================

CREATE TABLE IF NOT EXISTS blood_transfusions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  issue_id       UUID NOT NULL REFERENCES blood_issues(id) ON DELETE CASCADE,
  admission_id   UUID,
  started_at     TIMESTAMPTZ,
  ended_at       TIMESTAMPTZ,
  vitals_pre     JSONB,
  vitals_post    JSONB,
  administered_by UUID REFERENCES profiles(id),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blood_transfusions_issue     ON blood_transfusions (issue_id);
CREATE INDEX IF NOT EXISTS idx_blood_transfusions_admission ON blood_transfusions (admission_id) WHERE admission_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS blood_transfusion_reactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transfusion_id UUID NOT NULL REFERENCES blood_transfusions(id) ON DELETE CASCADE,
  reaction_type  TEXT NOT NULL CHECK (reaction_type IN ('febrile','allergic','hemolytic','anaphylactic','taco','trali','septic','other')),
  severity       TEXT NOT NULL CHECK (severity IN ('mild','moderate','severe','life_threatening')),
  action_taken   TEXT,
  reported_by    UUID REFERENCES profiles(id),
  reported_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blood_reactions_transfusion ON blood_transfusion_reactions (transfusion_id);

ALTER TABLE blood_transfusions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_transfusion_reactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY blood_transfusions_tenant_all ON blood_transfusions
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY blood_reactions_tenant_all ON blood_transfusion_reactions
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
