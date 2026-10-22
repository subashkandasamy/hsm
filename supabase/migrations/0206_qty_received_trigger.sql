-- Keep qty_received in step, wherever a batch is written.
--
-- 0205 made qty_received NOT NULL with no default, which would have broken
-- every path that creates a batch — the receive_stock_v1 RPC, the merge into
-- an existing batch of the same number and expiry, and the single-batch add
-- on the drug screen. Three call sites, two of them inside plpgsql.
--
-- Rewriting all three to set one more column would mean three places that can
-- drift. A trigger is one place, and it also covers whatever adds a batch
-- next year.
--
-- The rule is simple: receiving stock raises both numbers; dispensing lowers
-- only what is left.

CREATE OR REPLACE FUNCTION drug_batch_track_received() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A new batch: everything on the shelf arrived on the invoice.
    NEW.qty_received := COALESCE(NEW.qty_received, NEW.qty_available);
    RETURN NEW;
  END IF;

  -- An increase means more of this batch arrived — receive_stock_v1 merges a
  -- repeat delivery of the same batch number and expiry into the existing row.
  -- A decrease is dispensing, which does not change what was ever bought.
  --
  -- A manual stock correction upward is counted as received too. That is the
  -- honest reading: the units exist and came from somewhere, and a hospital
  -- correcting stock upward on the abortion register is a thing an inspector
  -- would rather see recorded than hidden.
  IF NEW.qty_available > OLD.qty_available THEN
    NEW.qty_received := COALESCE(OLD.qty_received, 0) + (NEW.qty_available - OLD.qty_available);
  ELSE
    NEW.qty_received := COALESCE(NEW.qty_received, OLD.qty_received);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_drug_batch_received ON drug_batches;
CREATE TRIGGER trg_drug_batch_received
  BEFORE INSERT OR UPDATE ON drug_batches
  FOR EACH ROW EXECUTE FUNCTION drug_batch_track_received();

-- ── And stop double-counting the free units ────────────────────────────────
--
-- receive_stock_v1 folds free_qty into qty_available before writing it, then
-- stores free_qty again as information. Adding the two back together in the
-- report counted every free unit twice — a hospital given ten free combipacks
-- would have reported buying twenty.

CREATE OR REPLACE FUNCTION get_mtp_drug_status(p_month text, p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
  drug_id        uuid,
  report_label   text,
  opening_qty    int,
  purchased_qty  int,
  invoice_refs   text,
  suppliers      text,
  total_qty      int,
  used_qty       int,
  closing_qty    int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_start  date := (p_month || '-01')::date;
  v_end    date := ((p_month || '-01')::date + interval '1 month')::date;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'get_mtp_drug_status: tenant_id could not be resolved';
  END IF;

  RETURN QUERY
  WITH tracked AS (
    SELECT t.drug_id, t.report_label, t.opening_qty, t.opening_as_of
      FROM mtp_tracked_drugs t
     WHERE t.tenant_id = v_tenant AND t.is_active
  ),
  purchases_before AS (
    SELECT b.drug_id, COALESCE(SUM(b.qty_received), 0)::int AS qty
      FROM drug_batches b JOIN tracked tk ON tk.drug_id = b.drug_id
     WHERE b.tenant_id = v_tenant
       AND b.purchase_date >= tk.opening_as_of AND b.purchase_date < v_start
     GROUP BY b.drug_id
  ),
  purchases_month AS (
    SELECT b.drug_id,
           COALESCE(SUM(b.qty_received), 0)::int AS qty,
           string_agg(DISTINCT NULLIF(b.supplier_invoice_no, ''), ', ') AS invoices,
           string_agg(DISTINCT NULLIF(b.supplier_name, ''), ', ')       AS suppliers
      FROM drug_batches b JOIN tracked tk ON tk.drug_id = b.drug_id
     WHERE b.tenant_id = v_tenant
       AND b.purchase_date >= v_start AND b.purchase_date < v_end
     GROUP BY b.drug_id
  ),
  sold AS (
    SELECT si.drug_id, si.qty, s.created_at::date AS on_date
      FROM pharmacy_sale_items si
      JOIN pharmacy_sales s ON s.id = si.pharmacy_sale_id
      JOIN tracked tk ON tk.drug_id = si.drug_id
     WHERE si.tenant_id = v_tenant AND s.status <> 'cancelled'
  ),
  issued AS (
    SELECT r.drug_id, r.quantity AS qty, r.dispensed_at::date AS on_date
      FROM ipd_pharmacy_requests r JOIN tracked tk ON tk.drug_id = r.drug_id
     WHERE r.tenant_id = v_tenant AND r.dispensed_at IS NOT NULL
  ),
  movements AS (
    SELECT drug_id, qty, on_date FROM sold
    UNION ALL
    SELECT drug_id, qty, on_date FROM issued
  ),
  used_before AS (
    SELECT m.drug_id, SUM(m.qty)::int AS qty
      FROM movements m JOIN tracked tk ON tk.drug_id = m.drug_id
     WHERE m.on_date >= tk.opening_as_of AND m.on_date < v_start
     GROUP BY m.drug_id
  ),
  used_month AS (
    SELECT m.drug_id, SUM(m.qty)::int AS qty
      FROM movements m
     WHERE m.on_date >= v_start AND m.on_date < v_end
     GROUP BY m.drug_id
  )
  SELECT
    tk.drug_id, tk.report_label,
    (tk.opening_qty + COALESCE(pb.qty, 0) - COALESCE(ub.qty, 0))::int,
    COALESCE(pm.qty, 0)::int,
    COALESCE(pm.invoices, '-'),
    COALESCE(pm.suppliers, '-'),
    (tk.opening_qty + COALESCE(pb.qty, 0) - COALESCE(ub.qty, 0) + COALESCE(pm.qty, 0))::int,
    COALESCE(um.qty, 0)::int,
    (tk.opening_qty + COALESCE(pb.qty, 0) - COALESCE(ub.qty, 0)
       + COALESCE(pm.qty, 0) - COALESCE(um.qty, 0))::int
  FROM tracked tk
  LEFT JOIN purchases_before pb ON pb.drug_id = tk.drug_id
  LEFT JOIN purchases_month  pm ON pm.drug_id = tk.drug_id
  LEFT JOIN used_before      ub ON ub.drug_id = tk.drug_id
  LEFT JOIN used_month       um ON um.drug_id = tk.drug_id
  ORDER BY tk.report_label;
END $$;
