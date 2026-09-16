-- Allow bill_source 'manual' ───────────────────────────────────────────────────
-- The daily IPD generator bills the admission fee, daily service charge and
-- custom charges onto a per-day bill with bill_source = 'manual' (IpdBillSource
-- in src/lib/ipdBilling.ts), but bills_bill_source_check never allowed that
-- value. Every such insert failed silently: those charges were never billed for
-- any hospital, and each attempt consumed an invoice number (a gap).

ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_source_check;
ALTER TABLE bills ADD CONSTRAINT bills_bill_source_check CHECK (bill_source = ANY (ARRAY[
  'bed', 'lab', 'radiology', 'ipd_pharmacy', 'nursing', 'nursing_morning', 'nursing_night',
  'consolidated', 'advance_refund', 'appointment_refund', 'ot', 'blood', 'consultation', 'icu',
  'manual'
]));
