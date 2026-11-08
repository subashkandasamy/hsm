-- Access an admin adds to a role.
--
-- A small hospital has ten staff and eight fixed roles. When the person at the
-- front desk is labelled HR, or the nurse also runs the lab, the fixed roles
-- either block them or push everyone onto one shared login. An admin can now
-- tick an access group for a role — every staff member in that role gets it.
--
-- Grants only ADD. They never take away what a role already has, which is all
-- the all-PERMISSIVE row-level security here can express: each grant is its
-- own policy, OR'd with the existing ones, which are left exactly as they are.
--
-- The groups, and the permissions behind each, live in src/lib/access.ts. What
-- is never grantable — prescribing, signing reports, PC&PNDT/MTP, cancelling
-- bills and approving discounts, hospital settings, staff and roles — has no
-- group, so it cannot be ticked.
--
-- The database side: a grant that lets a role use a screen must also let it
-- read the rows that screen shows, or it shows blanks — billing for HR without
-- patient names. So:
--   patients       read: registration, billing, lab, radiology, pharmacy, mlc
--                  write: registration
--   appointments   read: registration, billing        write: registration
--   visits         read: billing (the consultation fee, the appointment link)
--   prescriptions  read: pharmacy  (and list_pending_prescriptions, 0270)

CREATE TABLE IF NOT EXISTS role_access_grants (
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('doctor', 'nurse', 'receptionist', 'lab_tech', 'pharmacist', 'accountant', 'hr')),
  access_group  text NOT NULL CHECK (access_group IN ('registration', 'billing', 'lab', 'radiology', 'pharmacy', 'inventory', 'mlc')),
  granted_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, role, access_group)
);

COMMENT ON TABLE role_access_grants IS
  'Access groups an admin has added to a role (src/lib/access.ts). Additive only. The admin role is never listed: it already has everything.';

ALTER TABLE role_access_grants ENABLE ROW LEVEL SECURITY;

-- Every member of staff reads their hospital's grants: the screens and the
-- server read them to decide what to show.
DROP POLICY IF EXISTS role_access_grants_read ON role_access_grants;
CREATE POLICY role_access_grants_read ON role_access_grants
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()));

DROP POLICY IF EXISTS role_access_grants_admin_insert ON role_access_grants;
CREATE POLICY role_access_grants_admin_insert ON role_access_grants
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) = 'admin');

DROP POLICY IF EXISTS role_access_grants_admin_delete ON role_access_grants;
CREATE POLICY role_access_grants_admin_delete ON role_access_grants
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT current_active_role()) = 'admin');

REVOKE ALL ON role_access_grants FROM anon;
GRANT SELECT, INSERT, DELETE ON role_access_grants TO authenticated;

-- Whether the caller's role holds any of these groups in their hospital.
-- current_active_role() (0246) is NULL for a deactivated or other-hospital
-- profile, so a deactivated person holds nothing. SECURITY DEFINER so a policy
-- on another table can consult the grants without its own RLS in the way.
CREATE OR REPLACE FUNCTION public.role_has_access(p_groups text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM role_access_grants g
     WHERE g.tenant_id = current_tenant_id()
       AND g.role = current_active_role()
       AND g.access_group = ANY (p_groups)
  )
$$;
REVOKE ALL ON FUNCTION public.role_has_access(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.role_has_access(text[]) TO authenticated, service_role;

-- ── Granted rows ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS patients_granted_read ON patients;
CREATE POLICY patients_granted_read ON patients FOR SELECT TO authenticated
  USING (tenant_id = (SELECT current_tenant_id())
         AND (SELECT role_has_access(ARRAY['registration','billing','lab','radiology','pharmacy','mlc'])));

DROP POLICY IF EXISTS patients_granted_insert ON patients;
CREATE POLICY patients_granted_insert ON patients FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT role_has_access(ARRAY['registration'])));

DROP POLICY IF EXISTS patients_granted_update ON patients;
CREATE POLICY patients_granted_update ON patients FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT role_has_access(ARRAY['registration'])))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT role_has_access(ARRAY['registration'])));

DROP POLICY IF EXISTS appointments_granted_read ON appointments;
CREATE POLICY appointments_granted_read ON appointments FOR SELECT TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT role_has_access(ARRAY['registration','billing'])));

DROP POLICY IF EXISTS appointments_granted_insert ON appointments;
CREATE POLICY appointments_granted_insert ON appointments FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT role_has_access(ARRAY['registration'])));

DROP POLICY IF EXISTS appointments_granted_update ON appointments;
CREATE POLICY appointments_granted_update ON appointments FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT role_has_access(ARRAY['registration'])))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT role_has_access(ARRAY['registration'])));

DROP POLICY IF EXISTS visits_granted_read ON visits;
CREATE POLICY visits_granted_read ON visits FOR SELECT TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT role_has_access(ARRAY['billing'])));

DROP POLICY IF EXISTS prescriptions_granted_read ON prescriptions;
CREATE POLICY prescriptions_granted_read ON prescriptions FOR SELECT TO authenticated
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT role_has_access(ARRAY['pharmacy'])));

-- ── The pharmacy queue (0270) honours the pharmacy grant too ───────────────
CREATE OR REPLACE FUNCTION public.list_pending_prescriptions(p_limit integer DEFAULT 200)
RETURNS TABLE (
  id            uuid,
  visit_id      uuid,
  drug_name     text,
  dosage        text,
  frequency     text,
  duration      text,
  instructions  text,
  visit_date    timestamptz,
  patient_id    uuid,
  patient_name  text,
  patient_uhid  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
  v_role   text := current_active_role();
BEGIN
  IF v_tenant IS NULL OR v_role IS NULL
     OR NOT (v_role IN ('admin', 'doctor', 'nurse', 'receptionist', 'pharmacist') OR role_has_access(ARRAY['pharmacy'])) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT rx.id, rx.visit_id, rx.drug_name, rx.dosage, rx.frequency, rx.duration, rx.instructions,
         v.visit_date, v.patient_id, p.full_name, p.uhid
    FROM prescriptions rx
    JOIN visits v   ON v.id = rx.visit_id AND v.tenant_id = v_tenant
    JOIN patients p ON p.id = v.patient_id
   WHERE rx.tenant_id = v_tenant
     AND NOT EXISTS (SELECT 1 FROM dispenses d WHERE d.prescription_id = rx.id)
   ORDER BY v.visit_date DESC, rx.id
   LIMIT least(greatest(coalesce(p_limit, 200), 1), 500);
END;
$$;

NOTIFY pgrst, 'reload schema';
