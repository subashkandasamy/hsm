-- Add combined_bill_no to admissions (one per IPD stay)
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS combined_bill_no TEXT;
CREATE INDEX IF NOT EXISTS idx_admissions_combined_bill_no
  ON admissions(combined_bill_no) WHERE combined_bill_no IS NOT NULL;

-- Add combined_bill_no to visits (one per OPD encounter)
-- PostgreSQL 12+ propagates ADD COLUMN to all partitions automatically
ALTER TABLE visits ADD COLUMN IF NOT EXISTS combined_bill_no TEXT;
CREATE INDEX IF NOT EXISTS idx_visits_combined_bill_no
  ON visits(combined_bill_no) WHERE combined_bill_no IS NOT NULL;

-- Clear old patient-level combined_bill_no so it doesn't interfere
UPDATE patients SET combined_bill_no = NULL WHERE combined_bill_no IS NOT NULL;
