-- F-50 — DATA CHANGE. Separate from 0249 on purpose, so it can be refused
-- without holding up the code fix.
--
-- This UPDATEs 3 rows belonging to live tenants. Everything else in this audit
-- has been schema, policy or code; this is the first statement that edits a
-- hospital's records, so it is on its own and the exact rows are listed.
--
-- WHAT IS WRONG
--
-- A consultation billed through the appointment-stage route left its visit
-- flagged `billing_status = 'unbilled'`, because only generateBill's
-- flipToBilled ever set that column and this route does not go through it.
-- `startVisit` now marks it, which fixes every new visit. These three predate
-- the fix.
--
-- THE EXACT ROWS (read 2026-11-01; all three bills are paid in full)
--
--   aes-health   visit c2969cc6…  2026-09-07   bill CHENNAI-BILL-2026-00008  ₹1000 paid
--   newtest      visit f13c95d2…  2026-07-29   bill BILL-2026-00001          ₹500  paid
--   vrhospital   visit 78962d71…  2026-11-01   bill JPT/B2627/00004          ₹150  paid
--
-- None belongs to karur.
--
-- WHY IT IS SAFE, AND WHY IT IS NOT URGENT
--
-- All three carry `consultation_fee = 0`, and `getUnbilledCharges` filters on
-- `consultation_fee > 0`, so none of them is currently being offered for
-- billing a second time. That is exactly why F-50 had no live instances: the
-- protection was incidental — a fee that happened to be zero — not designed. A
-- priced consultation on this route would have been double-offered.
--
-- The change is therefore a correctness tidy-up: it makes the flag agree with
-- the money. It cannot cause a charge to be lost, because the condition
-- requires a non-cancelled bill that already contains the consultation line.
--
-- The statement is written to be re-runnable and to re-derive its own targets
-- rather than trusting the three ids above: if the data has moved on, it
-- updates what actually matches and nothing else.

BEGIN;

UPDATE public.visits v
   SET billing_status = 'billed'
 WHERE v.status = 'closed'
   AND v.billing_status <> 'billed'
   AND EXISTS (
     SELECT 1
       FROM public.bills b
       JOIN public.bill_items i ON i.bill_id = b.id AND i.source = 'consultation'
      WHERE b.status <> 'cancelled'
        AND (
          b.visit_id = v.id
          OR (v.appointment_id IS NOT NULL AND b.appointment_id = v.appointment_id)
        )
   );

COMMIT;
