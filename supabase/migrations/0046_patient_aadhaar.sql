-- Migration 0046: Add aadhaar_no to patients (optional, unique per tenant)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS aadhaar_no TEXT;

-- Unique per tenant (two patients in the same hospital can't share an Aadhaar)
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_aadhaar_tenant
  ON patients(tenant_id, aadhaar_no)
  WHERE aadhaar_no IS NOT NULL;
