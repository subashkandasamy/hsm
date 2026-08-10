-- Cost estimates / quotations: a printable pre-treatment cost estimate handed
-- to a patient before admission/surgery. NOT a bill — no charges captured, no
-- payment. Purely informational, with a validity date + disclaimer.

CREATE TABLE IF NOT EXISTS cost_estimates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  estimate_no    text NOT NULL,
  patient_id     uuid REFERENCES patients(id),
  patient_name   text,            -- for walk-in enquiries without a patient record
  patient_phone  text,
  admission_id   uuid REFERENCES admissions(id),
  room_type      text,
  estimated_days int,
  validity_date  date,
  notes          text,
  subtotal       numeric NOT NULL DEFAULT 0,
  total          numeric NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  created_by     uuid REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cost_estimates_tenant  ON cost_estimates (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_estimates_patient ON cost_estimates (patient_id);

CREATE TABLE IF NOT EXISTS cost_estimate_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  estimate_id uuid NOT NULL REFERENCES cost_estimates(id) ON DELETE CASCADE,
  category    text NOT NULL,
  description text NOT NULL,
  qty         numeric NOT NULL DEFAULT 1,
  unit_price  numeric NOT NULL DEFAULT 0,
  amount      numeric NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cost_estimate_items_estimate ON cost_estimate_items (estimate_id);

-- Per-tenant, per-year estimate number sequence (mirrors bill_no_seq).
CREATE TABLE IF NOT EXISTS estimate_no_seq (
  tenant_id uuid NOT NULL,
  year      int  NOT NULL,
  last_no   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, year)
);

CREATE OR REPLACE FUNCTION get_next_estimate_no(p_tenant_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_year      int  := EXTRACT(year FROM current_date)::int;
  v_seq       int;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'get_next_estimate_no: tenant_id could not be resolved';
  END IF;
  INSERT INTO estimate_no_seq (tenant_id, year, last_no) VALUES (v_tenant_id, v_year, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = estimate_no_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  RETURN 'EST-' || v_year || '-' || LPAD(v_seq::text, 5, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION get_next_estimate_no(uuid) TO authenticated, service_role;

-- RLS: tenant isolation (same pattern as nursing_units etc.)
ALTER TABLE cost_estimates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_estimate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_no_seq     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_estimates_tenant_all ON cost_estimates;
CREATE POLICY cost_estimates_tenant_all ON cost_estimates
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS cost_estimate_items_tenant_all ON cost_estimate_items;
CREATE POLICY cost_estimate_items_tenant_all ON cost_estimate_items
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
