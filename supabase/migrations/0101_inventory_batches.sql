-- =====================================================================
-- 0101_inventory_batches.sql
-- Phase 1 of the inventory upgrade: batch + expiry + lot tracking for
-- GENERAL (non-drug) inventory — reagents, IV fluids, sutures, test kits,
-- etc. Mirrors the pharmacy drug_batches pattern. inventory_items.qty_in_stock
-- becomes a cached total kept equal to SUM(inventory_batches.qty_available);
-- stock movements now reference the batch they touched (FEFO).
-- =====================================================================

CREATE TABLE IF NOT EXISTS inventory_batches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id)          ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES inventory_items(id)  ON DELETE CASCADE,
  batch_no      TEXT,                 -- lot number (nullable — not all supplies carry one)
  expiry        DATE,                 -- nullable — not all supplies expire
  qty_available INTEGER NOT NULL DEFAULT 0 CHECK (qty_available >= 0),
  unit_cost     NUMERIC,              -- purchase cost per unit (valuation, Phase 3)
  supplier_id   UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  po_id         UUID,                 -- purchase order it was received on (plain ref)
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_batches_item   ON inventory_batches (tenant_id, item_id);
-- Expiry alerts scan: only batches that still have stock and a real expiry.
CREATE INDEX IF NOT EXISTS idx_inv_batches_expiry ON inventory_batches (tenant_id, expiry)
  WHERE qty_available > 0 AND expiry IS NOT NULL;

-- Movements can now point at the specific batch they consumed/added.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS batch_id UUID;

ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY inv_batches_tenant_all ON inventory_batches
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: give every item that already has stock a single "OPENING" batch
-- (no expiry) so qty_in_stock == SUM(batches) from day one and nothing breaks.
INSERT INTO inventory_batches (id, tenant_id, item_id, batch_no, expiry, qty_available, created_at)
SELECT gen_random_uuid(), tenant_id, id, 'OPENING', NULL, qty_in_stock, now()
FROM inventory_items
WHERE qty_in_stock > 0
  AND NOT EXISTS (SELECT 1 FROM inventory_batches b WHERE b.item_id = inventory_items.id);

NOTIFY pgrst, 'reload schema';
