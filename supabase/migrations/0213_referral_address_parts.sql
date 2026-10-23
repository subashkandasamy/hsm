-- The referral sheet was missing the part of the address that matters.
--
-- anc_referrals_out snapshotted the free-text address and stopped there, while
-- the printed sheet reads district, state and PIN as well — so the column came
-- out short, missing exactly the field a PC&PNDT Appropriate Authority traces
-- a woman by. District is the whole reason those were split out onto patients
-- in the first place.

ALTER TABLE anc_referrals_out
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS state    text,
  ADD COLUMN IF NOT EXISTS pincode  text;

COMMENT ON COLUMN anc_referrals_out.district IS
  'Snapshot of where she lived when referred. A woman crossing district lines is the pattern the Act exists to notice.';
