-- Migration 0042: advance_refund as a bill source
-- Refunds are now tracked as negative bills (bill_source = 'advance_refund')
-- so they appear in the billing list and combined bill automatically.

ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_source_check;
ALTER TABLE bills ADD CONSTRAINT bills_bill_source_check
  CHECK (bill_source IN (
    'bed', 'lab', 'radiology', 'ipd_pharmacy',
    'nursing', 'nursing_morning', 'nursing_night',
    'consolidated', 'advance_refund'
  ));
