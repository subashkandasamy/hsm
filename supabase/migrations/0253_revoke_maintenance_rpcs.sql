-- A regression introduced by 0248, found by Supabase's own advisor after the
-- push. Recording the mechanism rather than just the fix, because it is the
-- same trap as F-74 one layer over.
--
-- WHAT WENT WRONG
--
-- `pg_default_acl` grants EXECUTE on every new function in `public` to `anon`
-- and `authenticated` — the function-level twin of the table grant that F-74
-- was about. I applied that lesson to tables and not to functions.
--
-- The mechanism is worth stating exactly, because it explains why only SOME of
-- the partition functions are affected:
--
--   CREATE OR REPLACE FUNCTION  -> keeps the existing ACL
--   CREATE (a genuinely new one) -> takes the default ACL
--
-- `alert_missing_next_partition` and `ensure_appointment_partition` were
-- replaced in place, so they kept the revocation they already had.
-- `create_next_month_partitions` was DROPped and recreated — deliberately, to
-- avoid leaving a stale zero-argument overload behind — and **the drop took its
-- revocation with it**. `ensure_partition_for`, `partition_runway` and
-- `record_partition_health` were new, so they never had one.
--
-- Measured after the push:
--
--   create_next_month_partitions(int)   SECURITY DEFINER  anon EXECUTE = true
--   ensure_partition_for(text, date)    SECURITY DEFINER  anon EXECUTE = true
--   partition_runway()                  SECURITY DEFINER  anon EXECUTE = true
--   record_partition_health()           SECURITY DEFINER  anon EXECUTE = true
--
-- All four are reachable unauthenticated at /rest/v1/rpc/<name>. Two of them
-- create tables. With the publishable key alone someone could call
-- `create_next_month_partitions(24)` repeatedly and make 150 partitions per
-- call, or `record_partition_health()` in a loop to grow that table without
-- limit. No data is disclosed — `partition_runway` returns only partition names
-- — so this is an availability and storage problem, not a PHI one, but it is
-- mine and it is one call away.
--
-- These are maintenance entry points for pg_cron, which runs them as the role
-- that scheduled them (postgres), so revoking the API roles costs nothing.
--
-- NOT revoked, deliberately:
--   * `ensure_appointment_partition` keeps `authenticated` — the app calls it
--     from appointments.ts and patientPortal.ts when someone books beyond the
--     pre-created range. It is SECURITY DEFINER owned by postgres, so its
--     internal call to `ensure_partition_for` runs with postgres's privileges
--     and is unaffected by the revocation below.
--   * `effective_test_range` keeps `authenticated` — lab.ts calls it as the
--     signed-in user on every result entry. It is SECURITY INVOKER, so RLS
--     applies; only `anon` is removed.
--   * `current_tenant_id` and `current_active_role` are left entirely alone
--     even though the advisor lists them. They are evaluated INSIDE RLS
--     policies, which run as the querying role — revoking EXECUTE from
--     `authenticated` would make every policy that calls them fail, locking
--     users out of `patients`. They return NULL without a session, so an
--     anonymous call discloses nothing.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.create_next_month_partitions(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_partition_for(text, date)      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partition_runway()                    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_partition_health()             FROM anon, authenticated;

-- Already revoked for anon; authenticated had it and has no reason to.
REVOKE EXECUTE ON FUNCTION public.alert_missing_next_partition()        FROM anon, authenticated;

-- SECURITY INVOKER and needed by signed-in staff; only the anonymous role goes.
REVOKE EXECUTE ON FUNCTION public.effective_test_range(uuid, uuid)      FROM anon;

-- Belt as well as braces: cap the argument so the function cannot be asked for
-- an unbounded number of partitions even by something that may call it. Four
-- months of runway is the operating figure; a year is generous for a restore.
CREATE OR REPLACE FUNCTION public.create_next_month_partitions(p_months_ahead int DEFAULT 3)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tables text[] := ARRAY[
    'audit_logs', 'appointments', 'visits',
    'bill_items', 'lab_order_items', 'lab_result_analytes'
  ];
  t text;
  i int;
BEGIN
  IF p_months_ahead < 1 OR p_months_ahead > 12 THEN
    RAISE EXCEPTION 'create_next_month_partitions: p_months_ahead must be between 1 and 12 (got %)', p_months_ahead;
  END IF;

  FOR i IN 0..p_months_ahead LOOP
    FOREACH t IN ARRAY tables LOOP
      PERFORM ensure_partition_for(t, (date_trunc('month', now()) + (i || ' months')::interval)::date);
    END LOOP;
  END LOOP;
END;
$function$;

-- CREATE OR REPLACE above preserves the ACL as it stands after the REVOKE, but
-- state it again rather than rely on the ordering holding true if this file is
-- ever re-run or split.
REVOKE EXECUTE ON FUNCTION public.create_next_month_partitions(integer) FROM anon, authenticated;

COMMIT;
