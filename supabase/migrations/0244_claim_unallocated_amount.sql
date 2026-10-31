-- F-56. When an insurer settles more than the encounter's bills have
-- outstanding, recordSettlement allocated what it could and left the remainder
-- in a local variable called `unallocated`, which was written into the audit
-- entry and nowhere else. No credit note, no advance, no ledger row, no warning
-- — the action returned plain success.
--
-- A TPA settles more than the bills outstanding on a corrected settlement, a
-- consolidated payment, or a bill cancelled after approval. The hospital then
-- has money in its bank and nothing in Uyirly saying where it belongs. It would
-- surface as a reconciliation mismatch months later.
--
-- F-57 puts money here too: the posting loop caught a failed
-- record_bill_payment, wrote to console.error and continued, so a failure left
-- the insurer's money unapplied while the claim read 'settled' and the user saw
-- success. That amount also lands in `unallocated`.
--
-- An audit JSON blob cannot be queried, totalled or reconciled. This gives the
-- amount a column, so "which settlements have money we have not placed" is a
-- question someone can actually ask.
ALTER TABLE public.insurance_claims
  ADD COLUMN IF NOT EXISTS unallocated_amount numeric;

COMMENT ON COLUMN public.insurance_claims.unallocated_amount IS
  'Settled money that was not posted to any bill: either the insurer paid more than the encounter had outstanding, or a posting failed. NULL means fully allocated. Needs a human decision — refund, apply elsewhere, or hold as credit.';

-- Finding one of these is the point, so make them cheap to find.
CREATE INDEX IF NOT EXISTS idx_insurance_claims_unallocated
  ON public.insurance_claims (tenant_id)
  WHERE unallocated_amount IS NOT NULL;
