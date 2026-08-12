-- Tenant document-number prefix ─────────────────────────────────────────────
-- Per-tenant counters restart at 1 for every hospital, so UH-2026-00005 exists
-- in every tenant. That's safe (uniqueness is per-tenant) but ambiguous to a
-- human looking across hospitals (portal, exports, support). Give each tenant a
-- short stable CODE and prefix every generated document number with it:
--   CITY-UH-2026-00005   CITY-BILL-2026-00046   CITY-EST-…   CITY-CN-…
--
-- The counters themselves are unchanged — the prefix is pure formatting. Only
-- NEW numbers carry it; existing rows stay valid (their tenant is always known
-- from context/RLS). When a tenant hasn't set a code, we fall back to its slug.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS code TEXT;

-- Unique among tenants that have set one (case-insensitive). NULL = not set yet,
-- so the fallback-to-slug path never trips this.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_code_unique
  ON tenants (upper(code)) WHERE code IS NOT NULL;

-- Single source of truth for the prefix. Sanitises to A-Z0-9 and uppercases;
-- falls back to the (always-present, always-unique) slug when no code is set.
-- STABLE + SECURITY DEFINER so the number generators can call it under any role.
CREATE OR REPLACE FUNCTION tenant_doc_prefix(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(upper(regexp_replace(COALESCE(NULLIF(t.code, ''), t.slug), '[^a-zA-Z0-9]', '', 'g')), ''),
    'HOSP'
  )
  FROM tenants t
  WHERE t.id = p_tenant_id;
$$;
GRANT EXECUTE ON FUNCTION tenant_doc_prefix(uuid) TO authenticated, service_role;

-- ── Recreate all five number generators with the prefix ──────────────────────

-- UHID (session variant — derives tenant from the session).
CREATE OR REPLACE FUNCTION get_next_uhid()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid := current_tenant_id();
  v_year      int  := extract(year from now())::int;
  v_next      int;
BEGIN
  INSERT INTO uhid_counter (tenant_id, year, last_val) VALUES (v_tenant_id, v_year, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_val = uhid_counter.last_val + 1
  RETURNING last_val INTO v_next;
  RETURN tenant_doc_prefix(v_tenant_id) || '-UH-' || v_year || '-' || lpad(v_next::text, 5, '0');
END;
$$;

-- UHID (explicit-tenant variant — service-role / patient portal self-registration).
CREATE OR REPLACE FUNCTION get_next_uhid_for(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := extract(year from now())::int;
  v_next int;
BEGIN
  INSERT INTO uhid_counter (tenant_id, year, last_val) VALUES (p_tenant_id, v_year, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_val = uhid_counter.last_val + 1
  RETURNING last_val INTO v_next;
  RETURN tenant_doc_prefix(p_tenant_id) || '-UH-' || v_year || '-' || lpad(v_next::text, 5, '0');
END;
$$;

-- Bill number.
CREATE OR REPLACE FUNCTION get_next_bill_no(p_tenant_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_year      int  := extract(year from current_date)::int;
  v_seq       int;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'get_next_bill_no: tenant_id could not be resolved (no argument and no session tenant)';
  END IF;
  INSERT INTO bill_no_seq (tenant_id, year, last_no) VALUES (v_tenant_id, v_year, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = bill_no_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  RETURN tenant_doc_prefix(v_tenant_id) || '-BILL-' || v_year || '-' || lpad(v_seq::text, 5, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION get_next_bill_no(uuid) TO authenticated, service_role;

-- Cost-estimate number.
CREATE OR REPLACE FUNCTION get_next_estimate_no(p_tenant_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_year      int  := extract(year FROM current_date)::int;
  v_seq       int;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'get_next_estimate_no: tenant_id could not be resolved';
  END IF;
  INSERT INTO estimate_no_seq (tenant_id, year, last_no) VALUES (v_tenant_id, v_year, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = estimate_no_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  RETURN tenant_doc_prefix(v_tenant_id) || '-EST-' || v_year || '-' || lpad(v_seq::text, 5, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION get_next_estimate_no(uuid) TO authenticated, service_role;

-- Credit-note number.
CREATE OR REPLACE FUNCTION get_next_credit_no(p_tenant_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_year      int  := extract(year FROM current_date)::int;
  v_seq       int;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'get_next_credit_no: tenant_id could not be resolved';
  END IF;
  INSERT INTO credit_no_seq (tenant_id, year, last_no) VALUES (v_tenant_id, v_year, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = credit_no_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  RETURN tenant_doc_prefix(v_tenant_id) || '-CN-' || v_year || '-' || lpad(v_seq::text, 5, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION get_next_credit_no(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
