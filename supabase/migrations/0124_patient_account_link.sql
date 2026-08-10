-- Master Patient Index: link each hospital's per-tenant patient record to the
-- one universal patient_accounts (portal) identity. Set silently by matching
-- phone / Aadhaar, or explicitly when a portal patient self-registers/books.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS patient_account_id UUID REFERENCES patient_accounts(id);

CREATE INDEX IF NOT EXISTS idx_patients_account
  ON patients (patient_account_id) WHERE patient_account_id IS NOT NULL;
