-- Add 'ot' to bills.bill_source CHECK constraint
-- Previously 0045 defined the constraint without 'ot'; surgery bills now use bill_source = 'ot'.
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_source_check;
ALTER TABLE bills ADD CONSTRAINT bills_bill_source_check
  CHECK (bill_source IN (
    'bed', 'lab', 'radiology', 'ipd_pharmacy',
    'nursing', 'nursing_morning', 'nursing_night',
    'consolidated', 'advance_refund', 'appointment_refund',
    'ot'
  ));
