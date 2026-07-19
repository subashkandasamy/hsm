-- =====================================================================
-- 0075_insurance_claim_raised_status_and_enquiry_log.sql
-- Insurance page redesign: adds a 'raised' status between Eligibility
-- Check (preauth) and Submitted, stage timestamps for an accurate
-- per-claim history, real cashless pre-auth fields (diagnosis, room
-- category, policy room-rent cap / sub-limits), and a running
-- enquiry/note log for the TPA back-and-forth loop.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. New 'raised' status
-- ---------------------------------------------------------------------
ALTER TABLE insurance_claims DROP CONSTRAINT insurance_claims_status_check;
ALTER TABLE insurance_claims ADD CONSTRAINT insurance_claims_status_check
  CHECK (status IN ('draft','preauth','raised','submitted','approved','rejected','settled'));

-- ---------------------------------------------------------------------
-- 2. Stage timestamps
-- ---------------------------------------------------------------------
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS raised_at TIMESTAMPTZ;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------
-- 3. Real cashless pre-auth fields
-- ---------------------------------------------------------------------
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS diagnosis TEXT;
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS room_category_requested TEXT;

-- ---------------------------------------------------------------------
-- 4. Policy-level caps
-- ---------------------------------------------------------------------
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS room_rent_limit_per_day NUMERIC;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS sub_limit_notes TEXT;

-- ---------------------------------------------------------------------
-- 5. Enquiry / note log
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insurance_claim_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  claim_id    UUID NOT NULL REFERENCES insurance_claims(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL,
  note        TEXT NOT NULL,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_claim_notes_claim ON insurance_claim_notes (claim_id);

ALTER TABLE insurance_claim_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurance_claim_notes_tenant_all ON insurance_claim_notes;
CREATE POLICY insurance_claim_notes_tenant_all ON insurance_claim_notes
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
