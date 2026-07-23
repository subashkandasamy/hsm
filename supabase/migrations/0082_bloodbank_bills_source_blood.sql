-- =====================================================================
-- 0082_bloodbank_bills_source_blood.sql
-- Blood Bank v2 — Phase 1 (cont.): allow 'blood' as a bills.bill_source so an
-- IPD transfusion can be auto-billed onto the admission via autoIpdBill.
-- bill_items.source already permits 'blood' (used by the manual bill builder).
-- =====================================================================

ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_source_check;
ALTER TABLE bills ADD CONSTRAINT bills_bill_source_check
  CHECK (bill_source IN (
    'bed', 'lab', 'radiology', 'ipd_pharmacy',
    'nursing', 'nursing_morning', 'nursing_night',
    'consolidated', 'advance_refund', 'appointment_refund',
    'ot', 'blood'
  ));

NOTIFY pgrst, 'reload schema';
