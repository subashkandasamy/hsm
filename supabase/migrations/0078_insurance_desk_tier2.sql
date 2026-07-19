-- =====================================================================
-- 0078_insurance_desk_tier2.sql
-- Tier 2 — turns the claim tracker into a desk workbench:
--   * an owner and a follow-up due date on each claim (aging / SLA reads
--     off follow_up_due + submitted_at in the app);
--   * a per-claim required-document checklist;
--   * enhancement requests as first-class interim events, each with its
--     own revised authorisation, instead of silently overwriting the
--     claim amount.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Owner + follow-up due date on the claim
-- ---------------------------------------------------------------------
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES profiles(id);
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS follow_up_due DATE;

-- ---------------------------------------------------------------------
-- 2. Required-document checklist
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insurance_claim_checklist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  claim_id     UUID NOT NULL REFERENCES insurance_claims(id) ON DELETE CASCADE,
  item         TEXT NOT NULL,
  is_provided  BOOLEAN NOT NULL DEFAULT false,
  provided_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insurance_claim_checklist_claim ON insurance_claim_checklist (claim_id);

ALTER TABLE insurance_claim_checklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurance_claim_checklist_tenant_all ON insurance_claim_checklist;
CREATE POLICY insurance_claim_checklist_tenant_all ON insurance_claim_checklist
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 3. Enhancement requests (interim, each with its own authorisation)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insurance_claim_enhancements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  claim_id         UUID NOT NULL REFERENCES insurance_claims(id) ON DELETE CASCADE,
  requested_amount NUMERIC NOT NULL,
  approved_amount  NUMERIC,
  al_number        TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  remarks          TEXT,
  created_by       UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT insurance_claim_enhancements_status_chk CHECK (status IN ('pending','approved','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_insurance_claim_enhancements_claim ON insurance_claim_enhancements (claim_id);

ALTER TABLE insurance_claim_enhancements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurance_claim_enhancements_tenant_all ON insurance_claim_enhancements;
CREATE POLICY insurance_claim_enhancements_tenant_all ON insurance_claim_enhancements
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
