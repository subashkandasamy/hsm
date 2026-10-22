-- Report V — the abortion drug stock account.
--
-- Opening balance, purchased during the month with invoice and supplier, used
-- during the month, closing balance. Per drug, every month.
--
-- ── Why this is not just a stock report ────────────────────────────────────
--
-- It is read against Report IV. A hospital reporting four terminations and
-- thirty used combipacks has told the Appropriate Authority something whether
-- it meant to or not, and that is the whole design intent of the pair. So the
-- numbers here are COMPUTED from what the pharmacy actually did, not typed in
-- beside the case count. A figure a human enters is a figure a human can make
-- agree.
--
-- ── Which drugs ───────────────────────────────────────────────────────────
--
-- The Tamil Nadu form names three brands — Combokit, Mefiprostal, Misoprostal
-- — rather than molecules, which is a strong sign it was drafted locally. So
-- the tracked list is per hospital rather than hardcoded: a hospital that
-- stocks a different brand must still be able to file.

CREATE TABLE IF NOT EXISTS mtp_tracked_drugs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  drug_id    uuid REFERENCES drugs(id) ON DELETE CASCADE,
  -- What the report should call it. The district form asks for brand names, so
  -- the label is kept separately from whatever the catalogue calls the drug.
  report_label text NOT NULL,
  -- The stock this hospital held when it started using Uyirly. Without it the
  -- first month's opening balance would be a guess, and every month after
  -- would inherit the guess.
  opening_qty      int NOT NULL DEFAULT 0,
  opening_as_of    date NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mtp_tracked_drug_key UNIQUE (tenant_id, drug_id)
);

ALTER TABLE mtp_tracked_drugs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mtp_tracked_drugs_tenant_all ON mtp_tracked_drugs;
CREATE POLICY mtp_tracked_drugs_tenant_all ON mtp_tracked_drugs FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

-- ── The report ─────────────────────────────────────────────────────────────
--
-- Everything is derived. Purchases come from the batches the pharmacy
-- received, with the supplier and invoice the form asks for. Usage counts BOTH
-- counter sales and ward issues — counting only the counter would understate
-- the figure, and an understated usage against a reported case count is
-- precisely the discrepancy an inspector is looking for.

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
  -- Everything received since the hospital declared its opening stock, so the
  -- balance walks forward from a known point rather than from zero.
  purchases_before AS (
    SELECT b.drug_id, COALESCE(SUM(b.qty_available + 0), 0)::int AS qty
      FROM drug_batches b JOIN tracked tk ON tk.drug_id = b.drug_id
     WHERE b.tenant_id = v_tenant
       AND b.purchase_date >= tk.opening_as_of AND b.purchase_date < v_start
     GROUP BY b.drug_id
  ),
  purchases_month AS (
    SELECT b.drug_id,
           COALESCE(SUM(b.qty_available + 0), 0)::int AS qty,
           string_agg(DISTINCT NULLIF(b.supplier_invoice_no, ''), ', ') AS invoices,
           string_agg(DISTINCT NULLIF(b.supplier_name, ''), ', ')       AS suppliers
      FROM drug_batches b JOIN tracked tk ON tk.drug_id = b.drug_id
     WHERE b.tenant_id = v_tenant
       AND b.purchase_date >= v_start AND b.purchase_date < v_end
     GROUP BY b.drug_id
  ),
  -- Counter sales.
  sold AS (
    SELECT si.drug_id, COALESCE(SUM(si.qty), 0)::int AS qty, s.created_at
      FROM pharmacy_sale_items si
      JOIN pharmacy_sales s ON s.id = si.pharmacy_sale_id
      JOIN tracked tk ON tk.drug_id = si.drug_id
     WHERE si.tenant_id = v_tenant AND s.status <> 'cancelled'
     GROUP BY si.drug_id, s.created_at
  ),
  -- Ward issues. Counting only the counter would understate usage in exactly
  -- the hospitals where terminations happen on a ward.
  issued AS (
    SELECT r.drug_id, COALESCE(SUM(r.quantity), 0)::int AS qty, r.dispensed_at
      FROM ipd_pharmacy_requests r JOIN tracked tk ON tk.drug_id = r.drug_id
     WHERE r.tenant_id = v_tenant AND r.dispensed_at IS NOT NULL
     GROUP BY r.drug_id, r.dispensed_at
  ),
  used_before AS (
    SELECT d.drug_id, SUM(d.qty)::int AS qty FROM (
      SELECT s.drug_id, s.qty FROM sold s, tracked tk
       WHERE tk.drug_id = s.drug_id AND s.created_at >= tk.opening_as_of AND s.created_at < v_start
      UNION ALL
      SELECT i.drug_id, i.qty FROM issued i, tracked tk
       WHERE tk.drug_id = i.drug_id AND i.dispensed_at >= tk.opening_as_of AND i.dispensed_at < v_start
    ) d GROUP BY d.drug_id
  ),
  used_month AS (
    SELECT d.drug_id, SUM(d.qty)::int AS qty FROM (
      SELECT s.drug_id, s.qty FROM sold s
       WHERE s.created_at >= v_start AND s.created_at < v_end
      UNION ALL
      SELECT i.drug_id, i.qty FROM issued i
       WHERE i.dispensed_at >= v_start AND i.dispensed_at < v_end
    ) d GROUP BY d.drug_id
  )
  SELECT
    tk.drug_id,
    tk.report_label,
    (tk.opening_qty + COALESCE(pb.qty, 0) - COALESCE(ub.qty, 0))::int AS opening_qty,
    COALESCE(pm.qty, 0)::int AS purchased_qty,
    COALESCE(pm.invoices, '-')  AS invoice_refs,
    COALESCE(pm.suppliers, '-') AS suppliers,
    (tk.opening_qty + COALESCE(pb.qty, 0) - COALESCE(ub.qty, 0) + COALESCE(pm.qty, 0))::int AS total_qty,
    COALESCE(um.qty, 0)::int AS used_qty,
    (tk.opening_qty + COALESCE(pb.qty, 0) - COALESCE(ub.qty, 0)
       + COALESCE(pm.qty, 0) - COALESCE(um.qty, 0))::int AS closing_qty
  FROM tracked tk
  LEFT JOIN purchases_before pb ON pb.drug_id = tk.drug_id
  LEFT JOIN purchases_month  pm ON pm.drug_id = tk.drug_id
  LEFT JOIN used_before      ub ON ub.drug_id = tk.drug_id
  LEFT JOIN used_month       um ON um.drug_id = tk.drug_id
  ORDER BY tk.report_label;
END $$;

COMMENT ON FUNCTION get_mtp_drug_status(text, uuid) IS
  'Report V for one month: opening, purchased with invoice and supplier, used, closing. Derived from pharmacy movements — never typed in, so it cannot be made to agree with the case count by hand.';
