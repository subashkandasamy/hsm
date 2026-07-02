-- Add billing fields to ipd_pharmacy_requests so dispensed items
-- appear in the IPD billing panel's pending charges list.
ALTER TABLE ipd_pharmacy_requests
  ADD COLUMN IF NOT EXISTS price_snapshot NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (billing_status IN ('pending', 'unbilled', 'billed'));

-- Index to speed up the unbilled-charges query
CREATE INDEX IF NOT EXISTS idx_ipd_pharmacy_req_billing
  ON ipd_pharmacy_requests (admission_id, billing_status, status);
