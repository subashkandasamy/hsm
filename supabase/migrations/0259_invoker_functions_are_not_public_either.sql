-- F-78 — `0238` swept SECURITY DEFINER functions. The INVOKER ones were never
-- swept, and some of them move money.
--
-- Found while verifying 0257's own grants: the two new MTP trigger functions
-- were correctly locked, and the equivalent Form F pair was not —
--
--   mtp_lock_completed     {postgres=X/postgres,service_role=X/postgres}
--   form_f_lock_completed  {=X/postgres,postgres=X/postgres,anon=X/postgres,…}
--                           ^^^^^^^^^^^ PUBLIC
--
-- which prompted the wider question. 18 of our own non-extension functions in
-- `public` are callable by `anon`, among them:
--
--   cancel_bill(p_bill_id)
--   issue_credit_note(p_bill_id, p_amount, p_method, p_reason)
--   refund_admission_advance(p_admission_id, p_amount, p_method)
--   apply_advance_to_bill(p_bill_id, p_admission_id)
--   save_lab_analyte_results(p_order_id, p_items, …)
--   withdraw_stale_critical(…) / withdraw_stale_critical_item(…)
--   refresh_dashboard_views()
--
-- Three of those cancel a bill, issue a credit note and refund a deposit.
--
-- IS IT EXPLOITABLE? NO — AND THAT IS THE PROBLEM
--
-- Checked rather than assumed, because `anon` does hold table grants:
--
--   bills       anon SELECT = true, anon UPDATE = true
--   lab_orders  anon SELECT = true, anon UPDATE = true
--
-- so the only thing standing in the way is RLS. The policy is:
--
--   tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated'
--
-- An anonymous caller fails both halves independently: it has no tenant, and its
-- role is `anon`. So `cancel_bill` reaches an UPDATE that matches zero rows and
-- returns its own "not found" result. Nothing is reachable today.
--
-- That is exactly the situation `0238` described in its own header — *"Most were
-- harmless by accident rather than by design. They open by asking
-- current_tenant_id() which hospital the caller belongs to; a stranger has no
-- answer, so the work fails. Protection as a side effect is not protection."* —
-- and then it fixed only the SECURITY DEFINER half.
--
-- WHY THE OTHER HALF WAS MISSED, INCLUDING BY ME
--
-- `0238` filtered on `p.prosecdef`, which was the right filter for the risk it
-- was chasing: a DEFINER function runs as postgres, so RLS is not in the way at
-- all. An INVOKER function is bounded by the caller's RLS, which is a genuinely
-- weaker exposure — but "bounded by RLS" is a statement about today's policies,
-- not a decision that these should be in the public API.
--
-- `scripts/verify-rpc-grants.sql`, which I wrote for F-77, inherited the same
-- filter and therefore the same blind spot. It is widened in this commit.
--
-- Written as a loop over what is actually granted, like 0238, so a function
-- added later is caught the next time it runs rather than quietly inheriting the
-- default again.

BEGIN;

DO $$
DECLARE
  r record;
  n_policy int := 0; n_trigger int := 0; n_maint int := 0; n_normal int := 0;

  -- Evaluated INSIDE RLS policies, which run as the querying role. Revoking
  -- EXECUTE here does not hide rows, it makes the policy RAISE — turning "you
  -- see nothing" into "the page breaks". Verified by asking which of our
  -- functions appear in pg_policies: exactly these five.
  policy_fns text[] := ARRAY[
    'current_tenant_id', 'current_active_role', 'current_profile_role',
    'is_tenant_admin', 'is_platform_admin'
  ];

  -- Maintenance: pg_cron runs these as the role that scheduled them (postgres),
  -- and service_role keeps them for an operator script. No signed-in user has a
  -- reason to hold them.
  maintenance_fns text[] := ARRAY[
    'refresh_dashboard_views',
    'create_next_month_partitions', 'ensure_partition_for',
    'partition_runway', 'record_partition_health', 'alert_missing_next_partition',
    'purge_tenant_data'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig, p.proname,
           (t.typname = 'trigger') AS is_trigger
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
      JOIN pg_type t ON t.oid = p.prorettype
     WHERE ns.nspname = 'public'
       -- Never touch an extension's own functions: they belong to the
       -- extension, and pgcrypto's gen_random_uuid() is called from column
       -- defaults all over this schema.
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
       AND (has_function_privilege('anon', p.oid, 'execute')
         OR has_function_privilege('authenticated', p.oid, 'execute'))
  LOOP
    IF r.proname = ANY (policy_fns) THEN
      -- Left exactly as they are. See above.
      n_policy := n_policy + 1;

    ELSIF r.is_trigger THEN
      -- A trigger function cannot be invoked as an RPC at all — Postgres
      -- refuses with "trigger functions can only be called as triggers" — and
      -- the triggering statement does not check the caller's EXECUTE. So this
      -- removes noise rather than a risk, and it makes the Form F pair match
      -- the MTP pair added in 0257.
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', r.sig);
      n_trigger := n_trigger + 1;

    ELSIF r.proname = ANY (maintenance_fns) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', r.sig);
      n_maint := n_maint + 1;

    ELSE
      -- The ordinary case: the app calls it as the signed-in user, and nobody
      -- should reach it without signing in.
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
      n_normal := n_normal + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'F-78: % policy helpers left alone, % trigger fns closed, % maintenance fns closed, % app fns restricted to authenticated',
    n_policy, n_trigger, n_maint, n_normal;
END $$;

-- The one invariant worth asserting rather than hoping for: nothing of ours is
-- callable by anon afterwards except the policy helpers, which return NULL
-- without a session.
DO $$
DECLARE leftover text := '';
BEGIN
  SELECT string_agg(p.proname, ', ') INTO leftover
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
     AND has_function_privilege('anon', p.oid, 'execute')
     AND p.proname <> ALL (ARRAY[
       'current_tenant_id', 'current_active_role', 'current_profile_role',
       'is_tenant_admin', 'is_platform_admin'
     ]);
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'F-78: still callable by anon after the sweep: %', leftover;
  END IF;
END $$;

COMMIT;
