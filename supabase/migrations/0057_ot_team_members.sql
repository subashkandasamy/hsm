-- Surgical team members for an OT schedule (multiple doctors per operation)
CREATE TABLE IF NOT EXISTS ot_team_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_schedule_id  UUID NOT NULL REFERENCES ot_schedules(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'assistant',
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ot_schedule_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_ot_team_members_schedule ON ot_team_members(ot_schedule_id);

ALTER TABLE ot_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_ot_team_select" ON ot_team_members;
CREATE POLICY "tenant_ot_team_select" ON ot_team_members
  FOR SELECT USING (
    ot_schedule_id IN (
      SELECT id FROM ot_schedules
      WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "tenant_ot_team_insert" ON ot_team_members;
CREATE POLICY "tenant_ot_team_insert" ON ot_team_members
  FOR INSERT WITH CHECK (
    ot_schedule_id IN (
      SELECT id FROM ot_schedules
      WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "tenant_ot_team_delete" ON ot_team_members;
CREATE POLICY "tenant_ot_team_delete" ON ot_team_members
  FOR DELETE USING (
    ot_schedule_id IN (
      SELECT id FROM ot_schedules
      WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    )
  );
