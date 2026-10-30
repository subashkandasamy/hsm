-- Staff could not be added, edited, deactivated or reactivated from the UI.
-- Every attempt failed with:
--
--   infinite recursion detected in policy for relation "profiles"  (42P17)
--
-- Three of the four policies on `profiles` asked `profiles` a question about
-- the caller:
--
--   exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
--
-- Postgres applies row-level security to that inner read as well, which
-- re-enters the same policies, which read `profiles` again. It spots the cycle
-- and refuses. The SELECT policy was never affected, because it only calls
-- current_tenant_id() — which is SECURITY DEFINER and therefore reads outside
-- RLS. That is why the staff list rendered while every write failed, and why
-- the bug hid since 0010: signup and the demo seed both write through the
-- service role, which bypasses policies entirely.
--
-- The fix is the pattern current_tenant_id() already uses: move the lookup into
-- a SECURITY DEFINER function so it is not subject to the policies it is being
-- used to evaluate.
--
-- Deliberately NOT changed here: a non-admin may still update their own row,
-- and WITH CHECK still constrains only tenant_id. That is pre-existing
-- behaviour and widening or narrowing it is a separate decision from stopping
-- the recursion.

CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Only ever reads the caller's own row, and returns a boolean, so being
  -- SECURITY DEFINER exposes nothing: it cannot be pointed at anybody else.
  -- No tenant clause is needed — the policies below already pin the target row
  -- to current_tenant_id(), which is this same caller's tenant.
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = (SELECT auth.uid())
       AND role = 'admin'
  )
$$;

REVOKE ALL     ON FUNCTION public.is_tenant_admin() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.is_tenant_admin() TO authenticated;

COMMENT ON FUNCTION public.is_tenant_admin() IS
  'Is the current user an admin? SECURITY DEFINER so policies ON profiles can ask without recursing.';

-- Recreate the three write policies, unchanged except for the helper call.

DROP POLICY IF EXISTS "profiles_tenant_self_update" ON profiles;
CREATE POLICY "profiles_tenant_self_update" ON profiles FOR UPDATE
  USING (
    tenant_id = (SELECT current_tenant_id())
    AND (id = (SELECT auth.uid()) OR (SELECT is_tenant_admin()))
  )
  WITH CHECK (tenant_id = (SELECT current_tenant_id()));

DROP POLICY IF EXISTS "profiles_tenant_admin_insert" ON profiles;
CREATE POLICY "profiles_tenant_admin_insert" ON profiles FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT current_tenant_id())
    AND (SELECT is_tenant_admin())
  );

DROP POLICY IF EXISTS "profiles_tenant_admin_delete" ON profiles;
CREATE POLICY "profiles_tenant_admin_delete" ON profiles FOR DELETE
  USING (
    tenant_id = (SELECT current_tenant_id())
    AND (SELECT is_tenant_admin())
  );

NOTIFY pgrst, 'reload schema';
