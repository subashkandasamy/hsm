-- =====================================================================
-- 0077_insurance_desk_tier1.sql
-- Tier 1 of the insurance-desk readiness work: the fields and structures
-- a real cashless/TPA desk cannot operate without, plus the fix for the
-- revenue leak where a final settlement below the eligibility-approved
-- figure was never trued up against the patient's bill.
--
--   * Policy identity      — member ID, policyholder + relationship,
--                            corporate scheme + employee ID, co-pay %
--   * Claim identifiers     — insurer pre-auth (AL) number, insurer claim
--                            number, ICD-10 code, planned/emergency +
--                            admit datetime, cost-head breakdown
--   * Settlement integrity  — UTR, TDS, structured disallowance lines,
--                            and an explicit shortfall resolution so a
--                            short settlement can no longer silently read
--                            as "fully covered".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Policy identity fields
-- ---------------------------------------------------------------------
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS member_id TEXT;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS policyholder_name TEXT;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS policyholder_relationship TEXT;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS corporate_name TEXT;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS copay_percent NUMERIC;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS policy_start_date DATE;

ALTER TABLE insurance_policies DROP CONSTRAINT IF EXISTS insurance_policies_relationship_chk;
ALTER TABLE insurance_policies ADD CONSTRAINT insurance_policies_relationship_chk
  CHECK (policyholder_relationship IS NULL OR policyholder_relationship
    IN ('self','spouse','parent','child','sibling','other'));

-- ---------------------------------------------------------------------
-- 2. Claim identifiers + pre-auth compliance fields
-- ---------------------------------------------------------------------
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS preauth_number TEXT;        -- insurer Authorisation Letter (AL) number
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS insurer_claim_number TEXT;  -- insurer/TPA claim reference (CCN)
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS icd_code TEXT;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS admission_type TEXT;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS admit_datetime TIMESTAMPTZ;
-- cost_breakdown: { room, icu, ot, professional, pharmacy, implants, other }
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS cost_breakdown JSONB;

ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS insurance_claims_admission_type_chk;
ALTER TABLE insurance_claims ADD CONSTRAINT insurance_claims_admission_type_chk
  CHECK (admission_type IS NULL OR admission_type IN ('planned','emergency'));

-- ---------------------------------------------------------------------
-- 3. Settlement integrity fields
-- ---------------------------------------------------------------------
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS settlement_utr TEXT;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS tds_amount NUMERIC;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS shortfall_amount NUMERIC;
-- How the gap between eligibility-covered and actually-settled is resolved.
--   write_off          — hospital absorbs it; patient still owes nothing.
--   recover_from_patient — the shortfall reverts to the patient's balance.
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS shortfall_resolution TEXT;

ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS insurance_claims_shortfall_res_chk;
ALTER TABLE insurance_claims ADD CONSTRAINT insurance_claims_shortfall_res_chk
  CHECK (shortfall_resolution IS NULL OR shortfall_resolution IN ('write_off','recover_from_patient'));

-- ---------------------------------------------------------------------
-- 4. Structured disallowance / deduction lines
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insurance_claim_deductions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  claim_id       UUID NOT NULL REFERENCES insurance_claims(id) ON DELETE CASCADE,
  description    TEXT NOT NULL,
  amount         NUMERIC NOT NULL,
  deduction_type TEXT NOT NULL,
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT insurance_claim_deductions_type_chk CHECK (
    deduction_type IN ('non_payable','room_rent','copay','reasonable_customary','other'))
);

CREATE INDEX IF NOT EXISTS idx_insurance_claim_deductions_claim ON insurance_claim_deductions (claim_id);

ALTER TABLE insurance_claim_deductions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurance_claim_deductions_tenant_all ON insurance_claim_deductions;
CREATE POLICY insurance_claim_deductions_tenant_all ON insurance_claim_deductions
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
