-- Migration 0045: appointment_refund as a bill source
-- When an appointment is cancelled after payment, the refund is tracked
-- as a negative bill (bill_source = 'appointment_refund') linked to the same appointment.

ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_source_check;
ALTER TABLE bills ADD CONSTRAINT bills_bill_source_check
  CHECK (bill_source IN (
    'bed', 'lab', 'radiology', 'ipd_pharmacy',
    'nursing', 'nursing_morning', 'nursing_night',
    'consolidated', 'advance_refund', 'appointment_refund'
  ));
