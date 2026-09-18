-- Receiving stock as a purchase invoice ──────────────────────────────────────
-- Stock arrives as a distributor invoice with many lines. Until now each batch
-- was added on its own and the supplier and invoice number were retyped every
-- time. A receipt now holds the invoice once and its batches hang off it.

CREATE TABLE IF NOT EXISTS stock_receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_name   TEXT,
  invoice_no      TEXT,
  invoice_date    DATE,
  /** What the invoice says, to check the lines against. */
  invoice_total   NUMERIC(12,2),
  /** First-time stock load rather than a purchase. */
  opening_stock   BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT,
  received_by     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_receipts_tenant ON stock_receipts (tenant_id, created_at DESC);
ALTER TABLE stock_receipts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY stock_receipts_tenant_all ON stock_receipts FOR ALL
    USING (tenant_id = (select current_tenant_id()) AND (select auth.role()) = 'authenticated')
    WITH CHECK (tenant_id = (select current_tenant_id()) AND (select auth.role()) = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
REVOKE ALL ON stock_receipts FROM anon;

ALTER TABLE drug_batches ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES stock_receipts(id) ON DELETE SET NULL;
-- Free (scheme) units that came with the purchase: stock counts them, cost does not.
ALTER TABLE drug_batches ADD COLUMN IF NOT EXISTS free_qty INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_drug_batches_receipt ON drug_batches (receipt_id) WHERE receipt_id IS NOT NULL;

/**
 * Saves a whole invoice at once: the receipt and every line, or nothing.
 * A line whose drug + batch number + expiry already exists adds to that batch
 * instead of creating a duplicate.
 */
CREATE OR REPLACE FUNCTION receive_stock_v1(p_header jsonb, p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tenant    uuid := current_tenant_id();
  v_receipt   uuid;
  v_line      jsonb;
  v_drug_m    uuid;
  v_drug_t    uuid;
  v_qty       int;
  v_expiry    date;
  v_existing  uuid;
  v_created   int := 0;
  v_merged    int := 0;
  v_units     int := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No hospital in context' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Nothing to receive' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO stock_receipts (tenant_id, supplier_name, invoice_no, invoice_date, invoice_total, opening_stock, notes, received_by)
  VALUES (
    v_tenant,
    nullif(btrim(coalesce(p_header->>'supplier_name', '')), ''),
    nullif(btrim(coalesce(p_header->>'invoice_no', '')), ''),
    (p_header->>'invoice_date')::date,
    (p_header->>'invoice_total')::numeric,
    coalesce((p_header->>'opening_stock')::boolean, false),
    nullif(btrim(coalesce(p_header->>'notes', '')), ''),
    auth.uid()
  )
  RETURNING id INTO v_receipt;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_drug_m := nullif(v_line->>'drug_master_id', '')::uuid;
    v_drug_t := nullif(v_line->>'drug_id', '')::uuid;
    v_qty    := coalesce((v_line->>'qty_available')::int, 0) + coalesce((v_line->>'free_qty')::int, 0);
    v_expiry := (v_line->>'expiry')::date;

    IF v_drug_m IS NULL AND v_drug_t IS NULL THEN
      RAISE EXCEPTION 'A line has no medicine' USING ERRCODE = 'P0001';
    END IF;
    IF coalesce(btrim(v_line->>'batch_no'), '') = '' THEN
      RAISE EXCEPTION 'A line has no batch number' USING ERRCODE = 'P0001';
    END IF;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Batch % has no quantity', v_line->>'batch_no' USING ERRCODE = 'P0001';
    END IF;
    IF v_expiry IS NULL OR v_expiry <= CURRENT_DATE THEN
      RAISE EXCEPTION 'Batch % has an expiry that has passed', v_line->>'batch_no' USING ERRCODE = 'P0001';
    END IF;

    SELECT b.id INTO v_existing FROM drug_batches b
     WHERE b.tenant_id = v_tenant
       AND b.batch_no = btrim(v_line->>'batch_no')
       AND b.expiry = v_expiry
       AND ((v_drug_m IS NOT NULL AND b.drug_master_id = v_drug_m) OR (v_drug_t IS NOT NULL AND b.drug_id = v_drug_t))
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE drug_batches
         SET qty_available = qty_available + v_qty,
             free_qty      = free_qty + coalesce((v_line->>'free_qty')::int, 0),
             mrp           = coalesce((v_line->>'mrp')::numeric, mrp),
             purchase_price = coalesce((v_line->>'purchase_price')::numeric, purchase_price)
       WHERE id = v_existing;
      v_merged := v_merged + 1;
    ELSE
      INSERT INTO drug_batches (
        tenant_id, drug_master_id, drug_id, receipt_id, batch_no, expiry, qty_available, free_qty,
        purchase_price, mrp, reorder_level, brand_name, manufacturer, pack_size, pack_unit,
        mfg_date, hsn_code, gst_rate, supplier_name, supplier_invoice_no, purchase_date, storage_location
      ) VALUES (
        v_tenant, v_drug_m, v_drug_t, v_receipt,
        btrim(v_line->>'batch_no'), v_expiry, v_qty, coalesce((v_line->>'free_qty')::int, 0),
        (v_line->>'purchase_price')::numeric, coalesce((v_line->>'mrp')::numeric, 0),
        coalesce((v_line->>'reorder_level')::int, 0),
        nullif(v_line->>'brand_name', ''), nullif(v_line->>'manufacturer', ''),
        (v_line->>'pack_size')::int, nullif(v_line->>'pack_unit', ''),
        (v_line->>'mfg_date')::date, nullif(v_line->>'hsn_code', ''), (v_line->>'gst_rate')::numeric,
        nullif(btrim(coalesce(p_header->>'supplier_name', '')), ''),
        nullif(btrim(coalesce(p_header->>'invoice_no', '')), ''),
        (p_header->>'invoice_date')::date,
        nullif(v_line->>'storage_location', '')
      );
      v_created := v_created + 1;
    END IF;
    v_units := v_units + v_qty;
  END LOOP;

  RETURN jsonb_build_object('receipt_id', v_receipt, 'created', v_created, 'merged', v_merged, 'units', v_units);
END;
$$;

REVOKE ALL ON FUNCTION receive_stock_v1(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION receive_stock_v1(jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
