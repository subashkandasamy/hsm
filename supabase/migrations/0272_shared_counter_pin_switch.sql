-- Switching between staff on a shared counter computer with a PIN.
--
-- One front-desk computer, four people, and a login that takes a minute: so
-- they share one account, and the activity log credits the wrong person with
-- every payment. An admin now marks a computer as a shared counter; on that
-- computer only, staff switch in with their own 4-digit PIN.
--
-- Two tables, and neither is readable or writable by any signed-in user —
-- there are deliberately NO policies for `authenticated`. Every read and write
-- goes through the server (src/app/actions/counter.ts) with the service role,
-- after its own checks: the caller's hospital, an admin for devices, the
-- person themselves (with their password) for a PIN. A PIN or device key is
-- never stored, only a hash of it.
--
-- shared_devices: a browser an admin approved. The browser holds a random key
--   in an httpOnly cookie; the database holds its SHA-256. A PIN is accepted
--   only from a browser presenting a live key for this hospital, so a PIN is
--   useless anywhere else. failed_attempts / locked_until throttle guessing
--   across all staff on one device.
-- staff_pins: one PIN per person, scrypt-hashed with its own salt. Five wrong
--   tries lock it until an admin resets it. Admins have no PIN: they always
--   sign in with their password.

CREATE TABLE IF NOT EXISTS shared_devices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  key_hash         text NOT NULL,
  created_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at     timestamptz,
  revoked_at       timestamptz,
  revoked_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  failed_attempts  integer NOT NULL DEFAULT 0,
  locked_until     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_shared_devices_tenant ON shared_devices (tenant_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE shared_devices IS
  'Browsers an admin approved as a shared counter (PIN switch). key_hash = SHA-256 of the key held in the browser''s httpOnly cookie. Server-only: no policies for signed-in users.';

CREATE TABLE IF NOT EXISTS staff_pins (
  profile_id       uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pin_hash         text NOT NULL,
  failed_attempts  integer NOT NULL DEFAULT 0,
  locked_at        timestamptz,
  set_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE staff_pins IS
  'Each person''s counter PIN, scrypt-hashed (never the PIN). locked_at set after 5 wrong tries; an admin reset deletes the row. Server-only: no policies for signed-in users.';

ALTER TABLE shared_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_pins     ENABLE ROW LEVEL SECURITY;

-- No policies at all for anon or authenticated: RLS on with nothing allowed.
-- The privileges go too, so a mistake in a future policy still cannot expose them.
REVOKE ALL ON shared_devices FROM anon, authenticated;
REVOKE ALL ON staff_pins     FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
