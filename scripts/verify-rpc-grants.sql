-- Which of our functions can the API roles call? Read-only; raises by design.
--
--   psql "$DATABASE_URL" -f scripts/verify-rpc-grants.sql
--
-- Postgres grants EXECUTE on every new function to PUBLIC, and PostgREST
-- publishes everything in `public` as an RPC, so a function joins the API the
-- moment it is created unless something revokes it. The revocation does not
-- survive a recreate either:
--
--   CREATE OR REPLACE  ->  keeps the ACL
--   DROP + CREATE      ->  takes the default ACL back
--
-- That is how `0248` re-exposed `create_next_month_partitions` after a signature
-- change (F-77). Hence a standing check rather than a one-off fix.
--
-- SCOPE, widened after F-78. This used to filter on `prosecdef`, inheriting
-- `0238`'s blind spot. A SECURITY DEFINER function is the sharper risk, because
-- it runs as postgres with RLS out of the way — but an INVOKER function being
-- anon-callable is still an API surface nobody chose, and `cancel_bill`,
-- `issue_credit_note` and `refund_admission_advance` were all on it.
--
-- Extension functions are excluded throughout: pgcrypto's `gen_random_uuid()`
-- is called from column defaults across this schema and is not ours to lock.
--
-- TWO ASSERTIONS, framed the way the policy actually is:
--
--   1. ANON may call only the policy helpers — an allowlist, because the set is
--      tiny and every addition deserves an argument.
--   2. AUTHENTICATED may NOT call the maintenance entry points — a denylist,
--      because after `0259` nearly every app function is authenticated-callable
--      by design, and listing them all would be noise nobody maintains.

DO $$
DECLARE
  v_anon  text := '';
  v_maint text := '';
  n_anon  int := 0;
  n_maint int := 0;
  r record;

  -- Evaluated INSIDE RLS policies, which run as the querying role. Revoking
  -- EXECUTE makes the policy RAISE rather than hide rows — turning "you see
  -- nothing" into "the page breaks". They return NULL without a session, so an
  -- anonymous call discloses nothing. Confirmed against pg_policies: exactly
  -- these five appear in a policy expression.
  policy_fns text[] := ARRAY[
    'current_tenant_id', 'current_active_role', 'current_profile_role',
    'is_tenant_admin', 'is_platform_admin'
  ];

  -- pg_cron runs these as the role that scheduled them (postgres), and
  -- service_role keeps them for an operator script. No signed-in user has a
  -- reason to hold them, and two of them create tables.
  maintenance_fns text[] := ARRAY[
    'refresh_dashboard_views', 'purge_tenant_data',
    'create_next_month_partitions', 'ensure_partition_for',
    'partition_runway', 'record_partition_health', 'alert_missing_next_partition'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
           p.prosecdef,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS a,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS u
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
     ORDER BY p.proname
  LOOP
    IF r.a AND NOT (r.proname = ANY (policy_fns)) THEN
      n_anon := n_anon + 1;
      v_anon := v_anon || format(E'\n    %s(%s)%s', r.proname, r.args,
        CASE WHEN r.prosecdef THEN '   [SECURITY DEFINER]' ELSE '' END);
    END IF;

    IF r.u AND r.proname = ANY (maintenance_fns) THEN
      n_maint := n_maint + 1;
      v_maint := v_maint || format(E'\n    %s(%s)', r.proname, r.args);
    END IF;
  END LOOP;

  RAISE EXCEPTION '%', format(
    E'\nRPC GRANTS (ours, not just SECURITY DEFINER)\n'
     '  callable by anon, beyond the policy helpers : %s   <- must be 0%s\n'
     '  maintenance fns callable by authenticated   : %s   <- must be 0%s',
    n_anon, CASE WHEN v_anon = '' THEN '' ELSE v_anon END,
    n_maint, CASE WHEN v_maint = '' THEN '' ELSE v_maint END);
END $$;
