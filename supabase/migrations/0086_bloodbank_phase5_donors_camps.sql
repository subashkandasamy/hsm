-- =====================================================================
-- 0086_bloodbank_phase5_donors_camps.sql
-- Blood Bank v2 — Phase 5: donor lifecycle + eligibility, donation camps, and
-- component separation (a whole-blood bag split into PRBC/FFP/platelets with
-- linked provenance; children inherit the parent's screening).
-- =====================================================================

-- Donor eligibility / contact
ALTER TABLE blood_donors ADD COLUMN IF NOT EXISTS gender         TEXT;
ALTER TABLE blood_donors ADD COLUMN IF NOT EXISTS age            INT;
ALTER TABLE blood_donors ADD COLUMN IF NOT EXISTS email          TEXT;
ALTER TABLE blood_donors ADD COLUMN IF NOT EXISTS deferral_until DATE;

-- Donation camps
CREATE TABLE IF NOT EXISTS blood_donation_camps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  location   TEXT,
  camp_date  DATE NOT NULL,
  organizer  TEXT,
  notes      TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blood_camps_date ON blood_donation_camps (camp_date DESC);

ALTER TABLE blood_donation_camps ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY blood_camps_tenant_all ON blood_donation_camps
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Unit provenance: which camp collected it, and component-separation parent
ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS camp_id        UUID REFERENCES blood_donation_camps(id);
ALTER TABLE blood_units ADD COLUMN IF NOT EXISTS parent_unit_id UUID REFERENCES blood_units(id);

-- Allow a 'separated' status for a whole-blood unit consumed into components
ALTER TABLE blood_units DROP CONSTRAINT IF EXISTS blood_units_status_check;
ALTER TABLE blood_units ADD CONSTRAINT blood_units_status_check
  CHECK (status IN ('available','reserved','issued','expired','discarded','separated'));

CREATE INDEX IF NOT EXISTS idx_blood_units_parent ON blood_units (parent_unit_id) WHERE parent_unit_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
