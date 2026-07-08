-- Phase 17: Barcoding — print-audit columns only.
-- Barcode values are derived: patient barcode = patients.uhid, sample barcode = lab_orders.id.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS wristband_printed_at timestamptz;

ALTER TABLE lab_orders
  ADD COLUMN IF NOT EXISTS sample_label_printed_at timestamptz;
