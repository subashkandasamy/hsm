-- Migration 0038: per-shift nursing bills + bill consolidation
--
-- Changes:
--   1. Extend bill_source check to include nursing_morning, nursing_night, consolidated
--   2. Same extension on bill_items.source
--   3. Add consolidated_by FK column on bills (links child bills to consolidated parent)

-- 1. Drop & recreate bill_source constraint on bills
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_source_check;
ALTER TABLE bills ADD CONSTRAINT bills_bill_source_check
  CHECK (bill_source IN (
    'bed', 'lab', 'radiology', 'ipd_pharmacy',
    'nursing', 'nursing_morning', 'nursing_night',
    'consolidated'
  ));

-- 2. Drop & recreate source constraint on bill_items
ALTER TABLE bill_items DROP CONSTRAINT IF EXISTS bill_items_source_check;
ALTER TABLE bill_items ADD CONSTRAINT bill_items_source_check
  CHECK (source IN (
    'consultation', 'bed', 'lab', 'radiology', 'pharmacy', 'ipd_pharmacy',
    'ot', 'ot_consumable', 'blood', 'manual', 'dental', 'pharmacy_sale_item',
    'nursing', 'nursing_morning', 'nursing_night'
  ));

-- 3. consolidated_by column and index
ALTER TABLE bills ADD COLUMN IF NOT EXISTS consolidated_by UUID REFERENCES bills(id);
CREATE INDEX IF NOT EXISTS idx_bills_consolidated_by
  ON bills (consolidated_by)
  WHERE consolidated_by IS NOT NULL;
