-- The ledger was tracking a table nobody uses.
--
-- drug_batches can reference a drug two ways — drugs(id), a tenant's own
-- catalogue entry, or drug_master_id, the shared catalogue. A check constraint
-- insists on exactly one.
--
-- In practice every batch in the system uses drug_master_id. All twelve of
-- them, across every tenant, and the drugs table is empty everywhere. The
-- tenant-catalogue path exists in the schema and is not the one the pharmacy
-- actually takes.
--
-- So mtp_tracked_drugs pointed at drugs(id) and would have matched nothing:
-- a hospital could have configured its three abortion drugs, dispensed them
-- all month, and filed a Report V of zeros. It would have looked like a quiet
-- month rather than a broken join.

ALTER TABLE mtp_tracked_drugs
  ADD COLUMN IF NOT EXISTS drug_master_id uuid REFERENCES drug_master(id) ON DELETE CASCADE;

-- Nothing is configured yet, so there is nothing to migrate — but the old
-- column stays rather than being dropped, because a tenant catalogue is still
-- a legitimate thing for a hospital to use and the day it does, this should
-- track it too.
ALTER TABLE mtp_tracked_drugs
  DROP CONSTRAINT IF EXISTS mtp_tracked_drug_key;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mtp_tracked_drug_ref') THEN
    ALTER TABLE mtp_tracked_drugs ADD CONSTRAINT mtp_tracked_drug_ref
      CHECK ((drug_id IS NOT NULL AND drug_master_id IS NULL)
          OR (drug_id IS NULL AND drug_master_id IS NOT NULL));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS mtp_tracked_master_key
  ON mtp_tracked_drugs (tenant_id, drug_master_id) WHERE drug_master_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mtp_tracked_tenant_key
  ON mtp_tracked_drugs (tenant_id, drug_id) WHERE drug_id IS NOT NULL;

ALTER TABLE mtp_records
  ADD COLUMN IF NOT EXISTS drug_master_id uuid REFERENCES drug_master(id) ON DELETE SET NULL;

-- ── Report V, matching on whichever reference the batch actually carries ───

-- The first column changes from drug_id to tracked_id, so the old signature
-- has to go before the new one can be created.
DROP FUNCTION IF EXISTS get_mtp_drug_status(text, uuid);

CREATE OR REPLACE FUNCTION get_mtp_drug_status(p_month text, p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
  tracked_id     uuid,
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
    SELECT t.id, t.drug_id, t.drug_master_id, t.report_label, t.opening_qty, t.opening_as_of
      FROM mtp_tracked_drugs t
     WHERE t.tenant_id = v_tenant AND t.is_active
  ),
  -- One join condition, written once: a batch belongs to a tracked drug if it
  -- carries either reference. Repeating this per CTE is how the two halves
  -- would drift apart.
  batches AS (
    SELECT tk.id AS tracked_id, b.qty_received, b.purchase_date,
           b.supplier_invoice_no, b.supplier_name, tk.opening_as_of
      FROM drug_batches b
      JOIN tracked tk
        ON (tk.drug_master_id IS NOT NULL AND b.drug_master_id = tk.drug_master_id)
        OR (tk.drug_id        IS NOT NULL AND b.drug_id        = tk.drug_id)
     WHERE b.tenant_id = v_tenant
  ),
  movements AS (
    SELECT tk.id AS tracked_id, si.qty, s.created_at::date AS on_date, tk.opening_as_of
      FROM pharmacy_sale_items si
      JOIN pharmacy_sales s ON s.id = si.pharmacy_sale_id
      JOIN tracked tk
        ON (tk.drug_master_id IS NOT NULL AND si.drug_master_id = tk.drug_master_id)
        OR (tk.drug_id        IS NOT NULL AND si.drug_id        = tk.drug_id)
     WHERE si.tenant_id = v_tenant AND s.status <> 'cancelled'
    UNION ALL
    SELECT tk.id, r.quantity, r.dispensed_at::date, tk.opening_as_of
      FROM ipd_pharmacy_requests r
      JOIN tracked tk
        ON (tk.drug_master_id IS NOT NULL AND r.drug_master_id = tk.drug_master_id)
        OR (tk.drug_id        IS NOT NULL AND r.drug_id        = tk.drug_id)
     WHERE r.tenant_id = v_tenant AND r.dispensed_at IS NOT NULL
  ),
  pb AS (SELECT b.tracked_id, SUM(b.qty_received)::int q FROM batches b
          WHERE b.purchase_date >= b.opening_as_of AND b.purchase_date < v_start GROUP BY 1),
  pm AS (SELECT b.tracked_id, SUM(b.qty_received)::int q,
                string_agg(DISTINCT NULLIF(b.supplier_invoice_no,''), ', ') inv,
                string_agg(DISTINCT NULLIF(b.supplier_name,''), ', ') sup
           FROM batches b
          WHERE b.purchase_date >= v_start AND b.purchase_date < v_end GROUP BY 1),
  ub AS (SELECT m.tracked_id, SUM(m.qty)::int q FROM movements m
          WHERE m.on_date >= m.opening_as_of AND m.on_date < v_start GROUP BY 1),
  um AS (SELECT m.tracked_id, SUM(m.qty)::int q FROM movements m
          WHERE m.on_date >= v_start AND m.on_date < v_end GROUP BY 1)
  SELECT
    tk.id, tk.report_label,
    (tk.opening_qty + COALESCE(pb.q,0) - COALESCE(ub.q,0))::int,
    COALESCE(pm.q,0)::int,
    COALESCE(pm.inv,'-'), COALESCE(pm.sup,'-'),
    (tk.opening_qty + COALESCE(pb.q,0) - COALESCE(ub.q,0) + COALESCE(pm.q,0))::int,
    COALESCE(um.q,0)::int,
    (tk.opening_qty + COALESCE(pb.q,0) - COALESCE(ub.q,0) + COALESCE(pm.q,0) - COALESCE(um.q,0))::int
  FROM tracked tk
  LEFT JOIN pb ON pb.tracked_id = tk.id
  LEFT JOIN pm ON pm.tracked_id = tk.id
  LEFT JOIN ub ON ub.tracked_id = tk.id
  LEFT JOIN um ON um.tracked_id = tk.id
  ORDER BY tk.report_label;
END $$;
