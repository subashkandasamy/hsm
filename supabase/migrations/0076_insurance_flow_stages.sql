-- =====================================================================
-- 0076_insurance_flow_stages.sql
-- Restructures the insurance claim lifecycle into two independent
-- decision tracks: eligibility_status (the provisional pre-auth
-- decision — Stage 2 "Eligibility Check") and status (the final claim
-- lifecycle — Stage 3 "Claim" / Stage 4 "Settlement"). Previously a
-- single flat `status` conflated both, which meant the old fast-path
-- pre-auth approval and a genuine final claim approval were
-- indistinguishable.
-- Also adds: settlement fields, a bank-accounts master table, and
-- policy-scoped document uploads.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. eligibility_status — Stage 2's own decision track
-- ---------------------------------------------------------------------
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS eligibility_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS eligibility_approved_amount NUMERIC;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS eligibility_decided_at TIMESTAMPTZ;

-- Backfill from the old single-status model before applying the new CHECK constraints.
UPDATE insurance_claims SET eligibility_status = 'approved'
  WHERE status IN ('raised','submitted','approved','settled');
UPDATE insurance_claims SET eligibility_status = 'rejected'
  WHERE status = 'rejected';
-- else stays 'pending' (covers draft/preauth)

ALTER TABLE insurance_claims ADD CONSTRAINT insurance_claims_eligibility_status_check
  CHECK (eligibility_status IN ('pending','approved','rejected'));

-- ---------------------------------------------------------------------
-- 2. status — now purely the Stage 3/4 (Claim/Settlement) lifecycle.
--    'preauth' is renamed 'awaiting_eligibility' to reflect that a claim
--    sits here until Stage 2 resolves, independent of this column.
-- ---------------------------------------------------------------------
UPDATE insurance_claims SET status = 'awaiting_eligibility' WHERE status = 'preauth';

ALTER TABLE insurance_claims DROP CONSTRAINT insurance_claims_status_check;
ALTER TABLE insurance_claims ADD CONSTRAINT insurance_claims_status_check
  CHECK (status IN ('draft','awaiting_eligibility','raised','submitted','approved','rejected','settled'));

-- ---------------------------------------------------------------------
-- 3. Settlement fields
-- ---------------------------------------------------------------------
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS settled_amount NUMERIC;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS settlement_notes TEXT;

-- ---------------------------------------------------------------------
-- 4. Bank accounts master table (mirrors insurance_tpas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insurance_bank_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_name   TEXT NOT NULL,
  bank_name      TEXT,
  account_number TEXT,
  ifsc_code      TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS settlement_account_id UUID REFERENCES insurance_bank_accounts(id);

ALTER TABLE insurance_bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurance_bank_accounts_tenant_all ON insurance_bank_accounts;
CREATE POLICY insurance_bank_accounts_tenant_all ON insurance_bank_accounts
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 5. Policy-scoped documents (mirrors the existing claim_id link)
-- ---------------------------------------------------------------------
ALTER TABLE patient_documents ADD COLUMN IF NOT EXISTS policy_id UUID REFERENCES insurance_policies(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
