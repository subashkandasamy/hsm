-- Migration 0112: Referral / partner program (Phase 1 — attribution + tracking).
--
-- A partner earns a recurring % on the NET subscription fees of the tenants they
-- refer. Partners can be a tenant (customer referral, e.g. Dr Arjun's hospital)
-- or an external partner (consultant/reseller). This phase adds attribution and
-- tracking; commission accrual + payout arrive with live billing (Phase 2).

CREATE TABLE IF NOT EXISTS partners (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        REFERENCES tenants(id) ON DELETE CASCADE,   -- set for tenant-partners; NULL for external
  name          TEXT        NOT NULL,
  type          TEXT        NOT NULL DEFAULT 'tenant' CHECK (type IN ('tenant','external')),
  email         TEXT,
  phone         TEXT,
  referral_code TEXT        NOT NULL UNIQUE,
  commission_pct           NUMERIC,   -- NULL = use global default
  commission_duration_months INT,     -- NULL = lifetime; else cap in months
  payout_method TEXT,
  status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)                    -- one partner per tenant (multiple NULLs allowed for external)
);
CREATE INDEX IF NOT EXISTS idx_partners_tenant ON partners (tenant_id);

CREATE TABLE IF NOT EXISTS referrals (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id         UUID        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  referred_tenant_id UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  signup_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (referred_tenant_id)           -- guard: one referrer per tenant (first code wins)
);
CREATE INDEX IF NOT EXISTS idx_referrals_partner ON referrals (partner_id);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS referred_by_partner_id UUID REFERENCES partners(id) ON DELETE SET NULL;

-- RLS: a tenant may read its own partner row and its own referrals. All writes
-- and cross-tenant reads (e.g. resolving a code at signup, listing referred
-- hospitals' names) happen in server actions via the service role.
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partners_own_select ON partners;
CREATE POLICY partners_own_select ON partners FOR SELECT
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referrals_own_select ON referrals;
CREATE POLICY referrals_own_select ON referrals FOR SELECT
  USING (EXISTS (SELECT 1 FROM partners p WHERE p.id = referrals.partner_id AND p.tenant_id = current_tenant_id())
         AND auth.role() = 'authenticated');
