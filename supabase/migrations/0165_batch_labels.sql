-- Our own label on the box ───────────────────────────────────────────────────
--
-- A manufacturer's barcode names the product but not the box: two batches of the
-- same brand scan identically. A label we print carries a code of our own, so a
-- scan names the exact batch — which is what makes expiry and FEFO something the
-- scan enforces rather than something the counter is trusted to remember.

ALTER TABLE drug_batches ADD COLUMN IF NOT EXISTS label_code TEXT;
-- Globally unique: a code read off a box must never mean two different boxes.
CREATE UNIQUE INDEX IF NOT EXISTS drug_batches_label_code ON drug_batches (label_code) WHERE label_code IS NOT NULL;

/**
 * The batch a scanned label pointed at. Null keeps the old behaviour — the
 * earliest-expiring batch is chosen when the medicines are handed over.
 */
ALTER TABLE pharmacy_sale_items ADD COLUMN IF NOT EXISTS drug_batch_id UUID REFERENCES drug_batches(id);

NOTIFY pgrst, 'reload schema';
