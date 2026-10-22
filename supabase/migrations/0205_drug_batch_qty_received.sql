-- What was received, as distinct from what is left.
--
-- drug_batches has carried only qty_available, which shrinks as stock is used.
-- For everyday pharmacy that is all anyone needs — the question is always "how
-- much is on the shelf".
--
-- Report V asks a different question: how much was PURCHASED during the month.
-- That cannot be read off a figure which has been going down since the day the
-- box arrived, and it cannot be reconstructed either, because ward issues
-- (ipd_pharmacy_requests) do not record which batch they came out of.
--
-- A hospital that bought thirty combipacks and used twenty-eight would have
-- reported buying two. Against a case count, that reads as concealment.

ALTER TABLE drug_batches
  ADD COLUMN IF NOT EXISTS qty_received int;

COMMENT ON COLUMN drug_batches.qty_received IS
  'Quantity on the invoice when this batch arrived. qty_available is what is left of it. Report V needs the first; stock screens need the second.';

-- Existing rows: the best available answer is what is still there, which is
-- right for anything untouched and an undercount for anything partly used.
-- Said plainly rather than quietly, because a hospital filing its first month
-- should know the opening figures lean low until a full month has passed under
-- the new column.
UPDATE drug_batches SET qty_received = qty_available WHERE qty_received IS NULL;

-- New batches must say. No default: a silent zero would be worse than a
-- failure, because it would file cleanly and be wrong.
ALTER TABLE drug_batches ALTER COLUMN qty_received SET NOT NULL;

-- ── Report V, now reading the right column ─────────────────────────────────

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
    SELECT b.drug_id, COALESCE(SUM(b.qty_received + COALESCE(b.free_qty, 0)), 0)::int AS qty
      FROM drug_batches b JOIN tracked tk ON tk.drug_id = b.drug_id
     WHERE b.tenant_id = v_tenant
       AND b.purchase_date >= tk.opening_as_of AND b.purchase_date < v_start
     GROUP BY b.drug_id
  ),
  purchases_month AS (
    SELECT b.drug_id,
           COALESCE(SUM(b.qty_received + COALESCE(b.free_qty, 0)), 0)::int AS qty,
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
    tk.drug_id,
    tk.report_label,
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
