-- Add dispatch tracking to dispenses.
-- Dispatch is the final handover of medicine to the patient AFTER payment.
-- NULL = not yet dispatched; timestamp = handed over.
ALTER TABLE dispenses
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
