-- Allow pharmacy_sale_items to reference drug_master drugs (global catalog)
-- Previously drug_id was NOT NULL and only referenced tenant drugs table.

ALTER TABLE pharmacy_sale_items
  ADD COLUMN IF NOT EXISTS drug_master_id UUID REFERENCES drug_master(id);

ALTER TABLE pharmacy_sale_items
  ALTER COLUMN drug_id DROP NOT NULL;

-- Ensure exactly one of drug_id / drug_master_id is set
ALTER TABLE pharmacy_sale_items
  DROP CONSTRAINT IF EXISTS chk_sale_item_drug_ref;

ALTER TABLE pharmacy_sale_items
  ADD CONSTRAINT chk_sale_item_drug_ref
    CHECK (
      (drug_id IS NOT NULL AND drug_master_id IS NULL) OR
      (drug_id IS NULL AND drug_master_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS pharmacy_sale_items_drug_master_idx
  ON pharmacy_sale_items (drug_master_id) WHERE drug_master_id IS NOT NULL;
