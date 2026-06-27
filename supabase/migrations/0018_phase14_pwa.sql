-- ============================================================
-- Phase 14: PWA + Capacitor Mobile
-- Push notification device token registry
-- ============================================================

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id           uuid        PRIMARY KEY,
  tenant_id    uuid        NOT NULL REFERENCES tenants(id),
  profile_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform     text        NOT NULL CHECK (platform IN ('ios', 'android')),
  push_token   text        NOT NULL,
  created_at   timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  UNIQUE (profile_id, push_token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_profile
  ON device_push_tokens (profile_id);

CREATE INDEX IF NOT EXISTS idx_device_tokens_tenant
  ON device_push_tokens (tenant_id);

ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;

-- A profile manages only its own device tokens
CREATE POLICY "device_tokens_own_profile" ON device_push_tokens
  FOR ALL
  USING  (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
