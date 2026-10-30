-- purge_tenant_data() could be called by anyone on the internet.
--
-- It deletes every row in every table carrying a tenant_id for the tenant it is
-- given, then marks that tenant purged. It is SECURITY DEFINER, so it runs as
-- the owner with row-level security switched off, and it carries no
-- authorization check of its own. PostgREST publishes every function in
-- `public` as an RPC, and `anon` held EXECUTE — and the anon key ships inside
-- every page of the website.
--
-- So a POST to /rest/v1/rpc/purge_tenant_data with a tenant UUID would
-- permanently destroy that hospital: patients, bills, lab results,
-- prescriptions, admissions. A tenant's own staff know their tenant id.
--
-- 0067 created it and revoked correctly, with this comment:
--
--   -- Only service role should call this (SECURITY DEFINER already enforces
--   -- it server-side)
--   REVOKE ALL ON FUNCTION purge_tenant_data(UUID) FROM PUBLIC;
--
-- The parenthetical is the root cause. SECURITY DEFINER decides what the
-- function RUNS AS. It does not decide WHO MAY CALL IT. Believing otherwise is
-- what made the grant look unimportant, and 0102 and 0103 then replaced the
-- function with no REVOKE at all.
--
-- The only caller is platform.ts, through service.rpc(), as the service role —
-- which keeps its grant, so the platform-admin purge is unaffected. No
-- is_platform_admin() check is added inside: the service role carries no JWT,
-- so that would break the one caller that is meant to work.

REVOKE ALL     ON FUNCTION public.purge_tenant_data(uuid) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_tenant_data(uuid) TO service_role;

-- A SECURITY DEFINER function without a pinned search_path can be steered into
-- resolving objects somewhere else. Pin it.
ALTER FUNCTION public.purge_tenant_data(uuid) SET search_path TO 'public';

COMMENT ON FUNCTION public.purge_tenant_data(uuid) IS
  'Destroys a tenant. service_role only — never grant to anon or authenticated.';
