-- 27 of the 35 SECURITY DEFINER functions could be called by a stranger.
--
-- Not anybody's mistake: Postgres grants EXECUTE to PUBLIC by default, and
-- PostgREST publishes everything in `public` as an RPC, so every one of these
-- was reachable with the anon key that ships inside every page of the site.
--
-- Most were harmless by accident rather than by design. They open by asking
-- current_tenant_id() which hospital the caller belongs to; a stranger has no
-- answer, so the work fails. Protection as a side effect is not protection.
--
-- Two did not even ask:
--
--   transfer_bed(admission, old_bed, new_bed) — moves a patient to another bed,
--     in any hospital, for anyone holding three UUIDs
--   get_next_uhid_for(tenant) — burns through a hospital's patient numbers and
--     leaks its document prefix
--
-- Their bodies are left alone deliberately. Revoking EXECUTE closes the hole
-- without changing what the legitimate caller does, and a tenant check added
-- inside today would be a behaviour change nobody has tested.
--
-- CARVE-OUT: current_tenant_id() keeps its grant. It is called from inside RLS
-- policies, and a policy whose function the caller may not execute raises an
-- error instead of returning no rows — so revoking it could turn "you see
-- nothing" into "the page breaks" on some anonymous path. Not worth it: it
-- takes no arguments, reads only the caller's own row, and returns NULL for a
-- stranger, which is exactly what everything downstream already expects.
--
-- Written as a loop over what is actually granted rather than a list of names,
-- so a function added later without a REVOKE is caught the next time this runs
-- rather than quietly inheriting the default again.

DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.prosecdef
       AND p.proname <> 'current_tenant_id'          -- see CARVE-OUT above
       AND has_function_privilege('anon', p.oid, 'execute')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'locked down % SECURITY DEFINER function(s)', n;
END $$;
