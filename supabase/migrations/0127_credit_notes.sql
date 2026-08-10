-- Refunds via Credit Notes. The original paid bill stays immutable; a credit
-- note records money returned against it (net collected = paid − credit notes).
-- Cash refunds flow into the Cash Book as cash-out.

CREATE TABLE IF NOT EXISTS credit_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bill_id      UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  credit_no    TEXT NOT NULL,
  amount       NUMERIC NOT NULL CHECK (amount > 0),
  method       TEXT NOT NULL CHECK (method IN ('cash','card','upi','bank_transfer')),
  reason       TEXT,
  refunded_by  UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_bill   ON credit_notes (bill_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_tenant ON credit_notes (tenant_id, created_at DESC);

-- Per-tenant, per-year credit-note number sequence (mirrors bill/estimate seqs).
CREATE TABLE IF NOT EXISTS credit_no_seq (
  tenant_id UUID NOT NULL,
  year      INT  NOT NULL,
  last_no   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, year)
);

CREATE OR REPLACE FUNCTION get_next_credit_no(p_tenant_id uuid DEFAULT NULL)
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
    RAISE EXCEPTION 'get_next_credit_no: tenant_id could not be resolved';
  END IF;
  INSERT INTO credit_no_seq (tenant_id, year, last_no) VALUES (v_tenant_id, v_year, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = credit_no_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  RETURN 'CN-' || v_year || '-' || LPAD(v_seq::text, 5, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION get_next_credit_no(uuid) TO authenticated, service_role;

ALTER TABLE credit_notes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_no_seq ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credit_notes_tenant_all ON credit_notes;
CREATE POLICY credit_notes_tenant_all ON credit_notes
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
