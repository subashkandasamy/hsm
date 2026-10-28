-- UPI collection at the counter.
--
-- A payment QR is nothing but a line of text saying "pay THIS id, THIS much".
-- To build that line we need the hospital's own UPI id, which is all this
-- migration adds. Money moves bank-to-bank between the patient and the
-- hospital; Uyirly is never in the path and holds no funds.

ALTER TABLE tenant_profiles
  ADD COLUMN IF NOT EXISTS upi_vpa        text,
  ADD COLUMN IF NOT EXISTS upi_payee_name text;

-- Whatever is typed here is where patients' money goes, and a wrong id pays a
-- stranger with no way to recall it. So the shape is enforced in the database
-- too, not only in the form that happens to be in front of someone today.
-- Deliberately permissive about the handle (@okicici, @ybl, @paytm, @sbi …) and
-- strict about the parts that are actually fixed by the spec.
ALTER TABLE tenant_profiles DROP CONSTRAINT IF EXISTS tenant_profiles_upi_vpa_shape;
ALTER TABLE tenant_profiles ADD CONSTRAINT tenant_profiles_upi_vpa_shape CHECK (
  upi_vpa IS NULL
  OR upi_vpa ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}@[a-zA-Z][a-zA-Z0-9.]{1,63}$'
);

COMMENT ON COLUMN tenant_profiles.upi_vpa IS
  'Hospital''s own UPI id (VPA). Payee of every counter payment QR. Never Uyirly''s.';
COMMENT ON COLUMN tenant_profiles.upi_payee_name IS
  'Name the patient sees in their UPI app. Falls back to the hospital name.';
