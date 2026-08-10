-- Patient portal moves from phone-OTP (over WhatsApp) to email + password login,
-- and a global platform switch to disable WhatsApp/SMS until the messaging
-- provider accounts are live (post company registration).

-- ── Patient portal accounts: email login + password + optional Aadhaar ───────
-- phone stays NOT NULL (mandatory everywhere). email is the login key.
ALTER TABLE patient_accounts
  ADD COLUMN IF NOT EXISTS email         TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS aadhaar       TEXT;

-- Unique email when present (Postgres allows multiple NULLs under a unique index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_accounts_email ON patient_accounts (lower(email)) WHERE email IS NOT NULL;

-- ── Global platform settings (key/value) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Messaging (WhatsApp/SMS) is OFF until the provider is live.
INSERT INTO platform_settings (key, value) VALUES ('messaging_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- Service-role only (platform-level, no tenant scope).
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_settings_deny ON platform_settings;
CREATE POLICY platform_settings_deny ON platform_settings FOR ALL USING (false);
