-- Separate number series for combined bill summaries ──────────────────────────
-- Combined OPD/IPD/patient bill summaries were numbered from the invoice series
-- (get_next_bill_no), and two summary views took a number on every page load
-- without saving it. Every such number is an invoice number that belongs to no
-- bill — gaps in the invoice series, which GST expects to run consecutively.
-- Summaries are not tax invoices, so they get their own series:
--   PREFIX-CB-2026-00001
-- Existing combined_bill_no values are left as they are.

CREATE TABLE IF NOT EXISTS summary_no_seq (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year      INT  NOT NULL,
  last_no   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, year)
);
-- No policies: only the SECURITY DEFINER function below touches it.
ALTER TABLE summary_no_seq ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON summary_no_seq FROM anon, authenticated;

CREATE OR REPLACE FUNCTION get_next_summary_no(p_tenant_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_year      int  := extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int;
  v_seq       int;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'get_next_summary_no: tenant_id could not be resolved';
  END IF;
  INSERT INTO summary_no_seq (tenant_id, year, last_no) VALUES (v_tenant_id, v_year, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = summary_no_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  RETURN tenant_doc_prefix(v_tenant_id) || '-CB-' || v_year || '-' || lpad(v_seq::text, 5, '0');
END;
$$;
REVOKE ALL ON FUNCTION get_next_summary_no(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_next_summary_no(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
