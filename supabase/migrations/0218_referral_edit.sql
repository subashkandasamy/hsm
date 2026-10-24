-- Letting a referral letter be corrected.
--
-- It was written once and never again, so fixing a typo meant filling the
-- whole form a second time and issuing a second letter — two reference
-- numbers for one patient going to one hospital, and nobody able to say which
-- one they were holding.
--
-- A referral is a clinical letter, not evidence. Unlike form_f_records and
-- mlc_records it is not filed with an authority, nobody is prosecuted over its
-- contents, and the amendment machinery those carry would be ceremony without
-- a reason. So it is simply editable, keeping its own number.
--
-- ── Except once it has been printed ───────────────────────────────────────
--
-- At that moment a copy leaves the building and the receiving doctor treats
-- the patient on that sheet. Quietly changing the diagnosis afterwards leaves
-- two letters in the world with the same number and nothing to say which is
-- current. That is not worth a locking scheme, but it is worth one line on the
-- page, so the reprint says it was revised and when the first copy went out.

ALTER TABLE referrals_out
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz,
  ADD COLUMN IF NOT EXISTS first_printed_at timestamptz;

COMMENT ON COLUMN referrals_out.first_printed_at IS
  'When a copy first left the building. After this, an edit is shown on the reprint as a revision.';
