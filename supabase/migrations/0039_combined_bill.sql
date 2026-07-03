-- Add permanent combined bill number to each patient
ALTER TABLE patients ADD COLUMN IF NOT EXISTS combined_bill_no TEXT;

-- Cleanup: clear consolidated_by tags so child bills are free again
UPDATE bills SET consolidated_by = NULL WHERE consolidated_by IS NOT NULL;

-- Cleanup: remove all data created by the broken consolidation feature
DELETE FROM bill_items WHERE bill_id IN (SELECT id FROM bills WHERE bill_source = 'consolidated');
DELETE FROM payments  WHERE bill_id IN (SELECT id FROM bills WHERE bill_source = 'consolidated');
DELETE FROM bills WHERE bill_source = 'consolidated';
