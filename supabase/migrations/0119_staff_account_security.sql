-- Staff account security: force-change-on-first-login + temp-password expiry.
-- `must_change_password` gates the dashboard until the staff member sets their
-- own password; `temp_password_expires_at` locks the temp credential after a
-- deadline so an unused invite can't be used indefinitely.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS temp_password_expires_at TIMESTAMPTZ;
