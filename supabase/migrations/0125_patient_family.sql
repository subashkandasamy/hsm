-- Family accounts: one login (patient_accounts = email+phone+password) can hold
-- multiple PEOPLE. Each person is a row in patient_members (the master), sharing
-- the family's login. Hospital records link to a member (by Aadhaar).

CREATE TABLE IF NOT EXISTS patient_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES patient_accounts(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  aadhaar      TEXT,               -- 12 digits; globally unique per person (portal-mandatory)
  dob          DATE,
  gender       TEXT,
  relationship TEXT,               -- self / spouse / child / parent / other
  is_self      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patient_members_account ON patient_members (account_id);

-- Backfill: each existing account becomes its own "self" member.
INSERT INTO patient_members (account_id, full_name, aadhaar, is_self, relationship)
SELECT id, COALESCE(NULLIF(full_name, ''), 'Patient'), aadhaar, true, 'self'
FROM patient_accounts
WHERE NOT EXISTS (SELECT 1 FROM patient_members m WHERE m.account_id = patient_accounts.id);

-- One person (Aadhaar) exists once across the whole master.
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_members_aadhaar
  ON patient_members (aadhaar) WHERE aadhaar IS NOT NULL;

-- Link each hospital record to a specific master member (person).
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS patient_member_id UUID REFERENCES patient_members(id);
CREATE INDEX IF NOT EXISTS idx_patients_member
  ON patients (patient_member_id) WHERE patient_member_id IS NOT NULL;

-- Service-role only (portal uses the service client; patients aren't RLS-scoped).
ALTER TABLE patient_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_members_deny ON patient_members;
CREATE POLICY patient_members_deny ON patient_members FOR ALL USING (false);
