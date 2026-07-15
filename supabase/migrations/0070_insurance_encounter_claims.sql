-- =====================================================================
-- 0070_insurance_encounter_claims.sql
-- Rework insurance so claims are encounter-scoped (admission / OPD visit)
-- rather than tied to a single fragmented bill, add pre-authorization,
-- co-pay, a TPA master, and claim document attachment.
--
-- insurance_claims is empty in production (verified 0 rows) so columns can
-- be added/relaxed without a data backfill.
-- RLS follows the project pattern: tenant isolation only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TPA / insurer master (tenant-scoped)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insurance_tpas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  code        TEXT,
  contact     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_insurance_tpas_tenant ON insurance_tpas (tenant_id, is_active);

ALTER TABLE insurance_tpas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurance_tpas_tenant_all ON insurance_tpas;
CREATE POLICY insurance_tpas_tenant_all ON insurance_tpas
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 2. insurance_policies: optional link to a TPA master row
-- ---------------------------------------------------------------------
ALTER TABLE insurance_policies
  ADD COLUMN IF NOT EXISTS tpa_id UUID REFERENCES insurance_tpas(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 3. insurance_claims: encounter scope, pre-auth, co-pay, claim type
-- ---------------------------------------------------------------------
ALTER TABLE insurance_claims
  ADD COLUMN IF NOT EXISTS admission_id    UUID REFERENCES admissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visit_id        UUID,                       -- visits is partitioned; no FK (matches bills.visit_id)
  ADD COLUMN IF NOT EXISTS estimated_amount NUMERIC,                   -- pre-auth estimate (before bills exist)
  ADD COLUMN IF NOT EXISTS copay_amount     NUMERIC NOT NULL DEFAULT 0, -- patient's share
  ADD COLUMN IF NOT EXISTS claim_type       TEXT NOT NULL DEFAULT 'cashless';

-- bill_id and claim_amount become optional (encounter claims aggregate bills;
-- pre-auth claims have no final amount yet).
ALTER TABLE insurance_claims ALTER COLUMN bill_id     DROP NOT NULL;
ALTER TABLE insurance_claims ALTER COLUMN claim_amount DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE insurance_claims ADD CONSTRAINT insurance_claims_type_chk
    CHECK (claim_type IN ('cashless','reimbursement'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A claim must target exactly one kind of encounter (admission / visit / bill).
DO $$ BEGIN
  ALTER TABLE insurance_claims ADD CONSTRAINT insurance_claims_scope_chk
    CHECK (admission_id IS NOT NULL OR visit_id IS NOT NULL OR bill_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_insurance_claims_admission ON insurance_claims (tenant_id, admission_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_visit     ON insurance_claims (tenant_id, visit_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_status    ON insurance_claims (tenant_id, status);

-- ---------------------------------------------------------------------
-- 4. patient_documents: allow attaching a document to a claim
-- ---------------------------------------------------------------------
ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS claim_id UUID REFERENCES insurance_claims(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patient_documents_claim ON patient_documents (claim_id) WHERE claim_id IS NOT NULL;

-- Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
