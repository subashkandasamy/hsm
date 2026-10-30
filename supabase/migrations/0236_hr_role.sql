-- An HR role: a non-clinical manager who runs attendance, leave and the duty
-- roster, and watches the hospital through aggregate figures.
--
-- What they deliberately do NOT get is any clinical screen. "Read-only access
-- to everything" sounds harmless and is not: it would hand a non-clinical
-- manager every diagnosis, lab result and psychiatric note in the building,
-- plus the MTP and PC&PNDT registers, whose confidentiality is statutory. The
-- dashboard they do get reads counts only — it never selects a patient name.
--
-- They may manage staff, but never an administrator, and never themselves into
-- one. Three separate holes have to be closed for that to be true, because an
-- HR user who can mint an admin IS an admin:
--
--   1. they must not CREATE a row with role 'admin'
--   2. they must not EDIT an existing admin's row (deactivating the owner, or
--      taking the account over)
--   3. they must not change their OWN role — not to admin, and not to doctor
--      either, which would be a side door into the clinical records above
--
-- The USING clause sees the row as it is, so `role <> 'admin'` there means "the
-- target is not currently an administrator". WITH CHECK sees the row as it
-- would become, so `role <> 'admin'` there means "is not being made one".
--
-- Note this is the database backstop only. updateStaffEmail and
-- resendStaffCredentials run under the service role and bypass policies
-- entirely, so they carry their own guards in src/app/actions/hr.ts.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (
  role = ANY (ARRAY['admin','doctor','nurse','receptionist','lab_tech','pharmacist','accountant','hr'])
);

DROP POLICY IF EXISTS "profiles_tenant_self_update" ON profiles;
CREATE POLICY "profiles_tenant_self_update" ON profiles FOR UPDATE
  USING (
    tenant_id = (SELECT current_tenant_id())
    AND (
      id = (SELECT auth.uid())
      OR (SELECT is_tenant_admin())
      -- HR may act on anyone who is not an administrator.
      OR ((SELECT current_profile_role()) = 'hr' AND role <> 'admin')
    )
  )
  WITH CHECK (
    tenant_id = (SELECT current_tenant_id())
    AND (
      (SELECT is_tenant_admin())
      -- Anyone editing their own row keeps the role they already had.
      OR (id = (SELECT auth.uid()) AND role = (SELECT current_profile_role()))
      -- HR may set anyone else's role, to anything except administrator.
      OR ((SELECT current_profile_role()) = 'hr'
          AND id <> (SELECT auth.uid())
          AND role <> 'admin')
    )
  );

DROP POLICY IF EXISTS "profiles_tenant_admin_insert" ON profiles;
CREATE POLICY "profiles_tenant_admin_insert" ON profiles FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT current_tenant_id())
    AND (
      (SELECT is_tenant_admin())
      OR ((SELECT current_profile_role()) = 'hr' AND role <> 'admin')
    )
  );

-- DELETE stays with administrators. Nothing in the app deletes a profile —
-- "remove" deactivates — so this is a boundary, not a workflow.

NOTIFY pgrst, 'reload schema';
