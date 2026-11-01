-- F-77, second attempt. `0253` applied cleanly and did not work, and the
-- detector written alongside it is what caught that.
--
-- WHY 0253 FAILED
--
-- It said:
--
--   REVOKE EXECUTE ON FUNCTION … FROM anon, authenticated;
--
-- but the grant was never held by those roles individually. The ACL read:
--
--   create_next_month_partitions  {=X/postgres,postgres=X/postgres,service_role=X/postgres}
--                                  ^^^^^^^^^^^
--
-- An empty grantee in a Postgres ACL is **PUBLIC**. Postgres grants EXECUTE on
-- every new function to PUBLIC by default, and `anon` and `authenticated`
-- inherit it from there. Revoking from the named roles removed grants they did
-- not separately hold — a successful no-op. The function stayed callable, the
-- migration reported success, and nothing complained.
--
-- `effective_test_range` shows the same thing from the other side: it still
-- reads `{=X/postgres,…,authenticated=X/postgres,…}` because 0253 revoked only
-- `anon` from it, and the named `authenticated` grant is visible there while the
-- PUBLIC grant sits in front of both.
--
-- This repository already knew. `0238_security_definer_functions_are_not_public`
-- opens with "Postgres grants EXECUTE to PUBLIC by default" and revokes
-- `FROM public, anon` in a loop over what is actually granted — written, in its
-- own words, "so a function added later without a REVOKE is caught the next
-- time this runs rather than quietly inheriting the default again."
--
-- Which is exactly what happened: 0248 added four functions, and the remedy was
-- already on disk. The right fix is to re-run that sweep, not to hand-write a
-- list of names — a list is the thing that goes stale.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The 0238 sweep again, over whatever is exposed now.
-- ---------------------------------------------------------------------------
-- Same carve-out, extended: `current_active_role` joined `current_tenant_id`
-- in 0246 and is called from the `patients` policies for the same reason, so
-- both keep a route for the roles that evaluate policies. A policy whose
-- function the caller may not execute raises instead of returning no rows,
-- which would turn "you see nothing" into "the page breaks".
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.prosecdef
       AND p.proname NOT IN ('current_tenant_id', 'current_active_role')
       AND has_function_privilege('anon', p.oid, 'execute')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'F-77: re-locked % SECURITY DEFINER function(s) exposed since 0238', n;
END $$;

-- ---------------------------------------------------------------------------
-- 2. The maintenance entry points are tighter than the house default.
-- ---------------------------------------------------------------------------
-- Step 1 restores the baseline, which grants `authenticated`. These five have
-- no caller among signed-in staff: pg_cron runs them as the role that scheduled
-- them (postgres), and `service_role` keeps EXECUTE for an operator script. Two
-- of them create tables, and one appends a row per call, so there is no reason
-- for a logged-in receptionist to hold them.
--
-- `ensure_appointment_partition` is deliberately absent from this list: the app
-- calls it when someone books beyond the pre-created range. It is SECURITY
-- DEFINER owned by postgres, so its internal call to `ensure_partition_for`
-- runs with postgres's privileges and is unaffected by the revocation here.
DO $$
DECLARE sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.create_next_month_partitions(integer)',
    'public.ensure_partition_for(text, date)',
    'public.partition_runway()',
    'public.record_partition_health()',
    'public.alert_missing_next_partition()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. effective_test_range is SECURITY INVOKER, so the sweep above skips it.
-- ---------------------------------------------------------------------------
-- `lab.ts` calls it as the signed-in user on every result entry, so
-- `authenticated` is required; PUBLIC and anon are not. Being INVOKER it is
-- bounded by RLS anyway, but an anonymous caller has no business holding it.
REVOKE ALL   ON FUNCTION public.effective_test_range(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.effective_test_range(uuid, uuid) TO authenticated, service_role;

COMMIT;
