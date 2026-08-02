-- =====================================================================
-- 0107_patient_directory.sql
-- Patient portal C + B: a hospital DIRECTORY patients can browse (hospitals
-- opt in), and SELF-REGISTRATION so a new patient can register at a listed
-- hospital and book. Self-registered patients are flagged unverified until the
-- hospital's front desk confirms them.
-- =====================================================================

-- C: opt-in to the patient app directory + a city for the listing card.
ALTER TABLE tenants  ADD COLUMN IF NOT EXISTS directory_listed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants  ADD COLUMN IF NOT EXISTS city TEXT;

-- B: mark patients created from the patient app (unverified until confirmed).
ALTER TABLE patients ADD COLUMN IF NOT EXISTS self_registered BOOLEAN NOT NULL DEFAULT false;

-- Service-role-safe UHID generator. get_next_uhid() uses current_tenant_id()
-- which is NULL under the service role (patient portal runs service-role), so
-- self-registration needs a tenant-explicit variant.
CREATE OR REPLACE FUNCTION get_next_uhid_for(p_tenant_id uuid) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year int := extract(year from now())::int;
  v_next int;
BEGIN
  INSERT INTO uhid_counter (tenant_id, year, last_val) VALUES (p_tenant_id, v_year, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_val = uhid_counter.last_val + 1
  RETURNING last_val INTO v_next;
  RETURN 'UH-' || v_year::text || '-' || lpad(v_next::text, 5, '0');
END;
$$;

NOTIFY pgrst, 'reload schema';
