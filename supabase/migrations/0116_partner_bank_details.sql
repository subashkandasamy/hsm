-- Migration 0116: structured payout/bank details for partners.
-- Partners maintain their own bank/UPI details in the partner portal so cash
-- commission can be paid out. Accessed only via the authenticated partner
-- session (service role) or platform admin — never anon.

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS bank_account_name   TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc           TEXT,
  ADD COLUMN IF NOT EXISTS upi_id              TEXT,
  ADD COLUMN IF NOT EXISTS pan_number          TEXT;
