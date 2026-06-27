-- ============================================================
-- Phase 13: Authentication Hardening
--   13.1  Forgot / Reset password
--   13.2  Mandatory SMS 2FA (custom OTP)
--   13.3  Rolling 24-hour session expiry
-- ============================================================

-- 1. Phone-verified flag on profiles (set true after first successful 2FA)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;

-- 2. OTP code store (used for login_2fa; only built because Supabase's
--    native phone-MFA may not match the SMS provider in use)
CREATE TABLE IF NOT EXISTS auth_otp_codes (
  id          uuid        PRIMARY KEY,
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  profile_id  uuid        NOT NULL REFERENCES profiles(id),
  purpose     text        NOT NULL DEFAULT 'login_2fa'
                          CHECK (purpose IN ('login_2fa')),
  code_hash   text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts    int         NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_otp_profile
  ON auth_otp_codes (profile_id, created_at DESC);

ALTER TABLE auth_otp_codes ENABLE ROW LEVEL SECURITY;

-- Tenant-isolated: staff can only see OTP rows for their own tenant
CREATE POLICY "otp_tenant_isolation" ON auth_otp_codes
  USING (tenant_id = current_tenant_id());
