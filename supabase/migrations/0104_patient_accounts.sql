-- =====================================================================
-- 0104_patient_accounts.sql
-- Patient self-service portal — Phase 1 foundation. A UNIVERSAL patient
-- identity keyed by phone (one login across every Uyirly hospital), plus a
-- phone-keyed OTP table for WhatsApp login. These are NOT Supabase auth users
-- and NOT tenant-scoped — a patient spans tenants. They're touched only by
-- service-role server actions (RLS on, no policy = deny to anon/authenticated),
-- which scope every clinical query to the verified patient's own records.
-- =====================================================================

CREATE TABLE IF NOT EXISTS patient_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL UNIQUE,          -- normalised, digits+country code (e.g. 919739784611)
  full_name     TEXT,                          -- convenience copy from the first matched patient record
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS patient_otp_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,                   -- normalised phone the code was issued to
  code_hash   TEXT NOT NULL,                   -- sha256 of the 6-digit code (never store plaintext)
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patient_otp_phone ON patient_otp_codes (phone, created_at DESC);

-- Service-role only: enable RLS with no policy so anon/authenticated get nothing.
ALTER TABLE patient_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_otp_codes ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
