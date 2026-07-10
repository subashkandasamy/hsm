-- Admin-granted access override.
-- When set to a future date, the tenant gets full access regardless of
-- trial_ends_at or subscription status (admin extends trial or grants free period).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS override_access_until TIMESTAMPTZ;
