-- ============================================================
-- Phase 13 addendum: per-tenant SMS 2FA toggle
-- Default OFF — tenants opt in when they want to pay for SMS
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS sms_2fa_enabled boolean NOT NULL DEFAULT false;
