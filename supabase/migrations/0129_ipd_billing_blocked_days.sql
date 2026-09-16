-- IPD billing blocked days ─────────────────────────────────────────────────────
-- The daily IPD catch-up bills any day that has no room-rent charge. A day can
-- be unbilled for two very different reasons:
--   1. the nightly job simply didn't run  → the day SHOULD be caught up
--   2. the hospital was blocked that day   → it must NEVER be billed
--      (read-only after the trial ended / subscription lapsed, or on a plan
--      without IPD, e.g. Starter)
-- The nightly job now records every blocked day here (when the hospital has
-- admitted patients), and the catch-up skips them.

CREATE TABLE IF NOT EXISTS ipd_billing_blocked_days (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day        DATE NOT NULL,                 -- IST calendar day
  reason     TEXT NOT NULL CHECK (reason IN ('readonly', 'plan')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, day)
);

ALTER TABLE ipd_billing_blocked_days ENABLE ROW LEVEL SECURITY;
-- Tenant users may read (the ward-board / discharge catch-up runs in their
-- session); only the service role writes (nightly job + this backfill).
DROP POLICY IF EXISTS ipd_billing_blocked_days_read ON ipd_billing_blocked_days;
CREATE POLICY ipd_billing_blocked_days_read ON ipd_billing_blocked_days
  FOR SELECT
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- ── Backfill past read-only windows ──────────────────────────────────────────
-- Before this table existed nothing recorded blocked days. Reconstruct the one
-- window we can: from the trial ending until the first subscription started
-- (or until today when still unsubscribed). A day counts as blocked when the
-- hospital was read-only at the start of that IST day — matching the nightly
-- job, which runs early morning.
INSERT INTO ipd_billing_blocked_days (tenant_id, day, reason)
SELECT t.id, gs::date, 'readonly'
FROM tenants t
LEFT JOIN LATERAL (
  SELECT min(s.created_at) AS sub_at FROM subscriptions s WHERE s.tenant_id = t.id
) s ON true
CROSS JOIN LATERAL generate_series(
  -- first IST day starting at/after the trial end
  (((t.trial_ends_at AT TIME ZONE 'Asia/Kolkata') - interval '1 microsecond')::date + 1)::timestamp,
  -- last IST day that started before access returned (or today if still locked)
  (CASE
     WHEN s.sub_at IS NOT NULL THEN ((s.sub_at AT TIME ZONE 'Asia/Kolkata') - interval '1 microsecond')::date
     ELSE (now() AT TIME ZONE 'Asia/Kolkata')::date
   END)::timestamp,
  interval '1 day'
) AS gs
WHERE t.trial_ends_at IS NOT NULL
  AND t.trial_ends_at < now()
  AND (
    (s.sub_at IS NOT NULL AND s.sub_at > t.trial_ends_at)
    -- No subscription: only a hospital still on its expired trial is locked;
    -- one activated manually by the platform wasn't, so don't guess.
    OR (s.sub_at IS NULL AND t.status = 'trial')
  )
ON CONFLICT (tenant_id, day) DO NOTHING;
