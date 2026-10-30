-- A staff member could make themselves an administrator.
--
-- The update policy on `profiles` lets you edit your own row — which is right,
-- people change their own phone number. But WITH CHECK, the rule about what the
-- row may *become*, only ever verified tenant_id. It never looked at `role`.
--
-- So a nurse could update her own record and set role = 'admin'. Not through the
-- app: the Staff screen is admin-only and requirePermission('hr:manage') refuses
-- her. But the anon key ships inside every page's JavaScript, so with that and
-- her own valid login she could call PostgREST directly. Row-level security
-- exists precisely for the request that skips the app, and here it was not
-- holding that line.
--
-- It is not a cross-tenant hole — she still cannot reach another hospital — and
-- it needs a real staff login, so this is an insider escalation, not an outside
-- one. That is why it was worth fixing carefully rather than at speed.
--
-- The check cannot be written inline. `role = (select role from profiles ...)`
-- inside a policy ON profiles is the same self-reference that caused 42P17 in
-- 0234, so the lookup goes into a SECURITY DEFINER function for the same reason.

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Reads only the caller's own row and returns their role, so being
  -- SECURITY DEFINER exposes nothing that auth.uid() did not already identify.
  SELECT role FROM profiles WHERE id = (SELECT auth.uid())
$$;

REVOKE ALL     ON FUNCTION public.current_profile_role() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;

COMMENT ON FUNCTION public.current_profile_role() IS
  'The caller''s own role. SECURITY DEFINER so policies ON profiles can ask without recursing.';

-- USING is unchanged from 0234 — who may edit which row is already correct.
-- Only WITH CHECK changes: an admin may set any role, anybody else must leave
-- their role exactly as it was. Name, phone and the rest stay editable.
DROP POLICY IF EXISTS "profiles_tenant_self_update" ON profiles;
CREATE POLICY "profiles_tenant_self_update" ON profiles FOR UPDATE
  USING (
    tenant_id = (SELECT current_tenant_id())
    AND (id = (SELECT auth.uid()) OR (SELECT is_tenant_admin()))
  )
  WITH CHECK (
    tenant_id = (SELECT current_tenant_id())
    AND ((SELECT is_tenant_admin()) OR role = (SELECT current_profile_role()))
  );

NOTIFY pgrst, 'reload schema';
