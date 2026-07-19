-- =====================================================================
-- 0079_insurance_desk_tier3.sql
-- Tier 3 — enterprise parity:
--   * per-insurer agreed tariff / package rates (empanelment);
--   * remittance batches so one insurer transfer covering many claims
--     can be reconciled against the claims it settles;
--   * a denial reason on the claim and, via the app, appeal / re-open of
--     a rejected claim instead of only "retry as a new claim".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Agreed tariff / package rates per insurer or TPA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insurance_tariff_packages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider     TEXT,                                   -- insurer this rate is agreed with (free text, matches policy.provider)
  tpa_id       UUID REFERENCES insurance_tpas(id) ON DELETE SET NULL,
  package_name TEXT NOT NULL,
  package_code TEXT,
  amount       NUMERIC NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insurance_tariff_packages_tenant ON insurance_tariff_packages (tenant_id);

ALTER TABLE insurance_tariff_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurance_tariff_packages_tenant_all ON insurance_tariff_packages;
CREATE POLICY insurance_tariff_packages_tenant_all ON insurance_tariff_packages
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 2. Remittance batches (one insurer transfer → many settled claims)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insurance_remittance_batches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference     TEXT NOT NULL,                         -- batch / UTR reference from the insurer
  insurer       TEXT,
  total_amount  NUMERIC NOT NULL,
  received_date DATE,
  account_id    UUID REFERENCES insurance_bank_accounts(id) ON DELETE SET NULL,
  notes         TEXT,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insurance_remittance_batches_tenant ON insurance_remittance_batches (tenant_id);

ALTER TABLE insurance_remittance_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurance_remittance_batches_tenant_all ON insurance_remittance_batches;
CREATE POLICY insurance_remittance_batches_tenant_all ON insurance_remittance_batches
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- Which batch a settled claim was reconciled against.
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS remittance_batch_id UUID REFERENCES insurance_remittance_batches(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 3. Denial reason (structured-ish) on the claim
-- ---------------------------------------------------------------------
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS denial_reason TEXT;

NOTIFY pgrst, 'reload schema';
