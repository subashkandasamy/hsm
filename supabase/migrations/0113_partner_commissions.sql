-- Migration 0113: partner commission ledger (referral Phase 2).
--
-- One row per successful subscription charge of a referred tenant. Commission is
-- computed on the NET subscription fee (plan price, ex-GST). Idempotent on the
-- Razorpay payment id so webhook retries never double-accrue. Tenant-partners
-- accrue as `credit` (applied to their own bill), external partners as `cash`.

CREATE TABLE IF NOT EXISTS partner_commissions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id         UUID        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  referred_tenant_id UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_payment_id  TEXT        NOT NULL UNIQUE,     -- Razorpay payment id (idempotency key)
  period             TEXT        NOT NULL,            -- YYYY-MM
  base_amount        NUMERIC     NOT NULL,            -- net subscription fee the % applies to
  commission_pct     NUMERIC     NOT NULL,
  commission_amount  NUMERIC     NOT NULL,
  payout_type        TEXT        NOT NULL DEFAULT 'cash' CHECK (payout_type IN ('credit','cash')),
  status             TEXT        NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued','paid','reversed')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_partner ON partner_commissions (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant  ON partner_commissions (referred_tenant_id);

-- RLS: a tenant may read commissions earned by its own partner row. Writes and
-- cross-tenant/admin reads happen in server actions / the webhook via service role.
ALTER TABLE partner_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_commissions_own_select ON partner_commissions;
CREATE POLICY partner_commissions_own_select ON partner_commissions FOR SELECT
  USING (EXISTS (SELECT 1 FROM partners p WHERE p.id = partner_commissions.partner_id AND p.tenant_id = current_tenant_id())
         AND auth.role() = 'authenticated');
