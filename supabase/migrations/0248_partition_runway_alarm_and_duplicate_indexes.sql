-- Partition group: F-39, F-40, F-41, plus two defects found while verifying
-- them (F-73 duplicate indexes, F-74 the unhardened on-demand path).
--
-- Verified live before writing, on 2026-11-01:
--
--   cron job 1 'create-next-month-partitions'  schedule '5 0 1 * *'
--   cron job 4 'alert-missing-partitions'      schedule '0 9 * * *'
--   runway: every partitioned table ends at y2026m12 except appointments
--           (y2027m12, pre-created by migration 0094)
--   all 70 existing partitions: relrowsecurity = true, anon SELECT = false
--
-- That last line matters: the audit's partition findings are about resilience,
-- not a present exposure. Nothing is leaking today. Checked, not assumed.

BEGIN;

-- ---------------------------------------------------------------------------
-- F-74 (new) — the on-demand path creates partitions nobody hardened
-- ---------------------------------------------------------------------------
-- `ensure_appointment_partition` is called from appointments.ts:86 and
-- patientPortal.ts:701 to create a partition on demand when someone books
-- further ahead than the cron has reached. Unlike the cron it called neither
-- secure_partition nor anything else:
--
--   CREATE TABLE %I PARTITION OF appointments FOR VALUES FROM (%L) TO (%L)
--
-- and that is the whole body. Why that is not cosmetic — `pg_default_acl`:
--
--   schema public, objtype r:
--     anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres
--
-- Every new table in `public` is created with ALL privileges granted to `anon`
-- and `authenticated`, and a fresh partition has relrowsecurity = false. A
-- partition born on this path would therefore be a PostgREST-reachable table
-- holding every tenant's appointments with no RLS and a full grant to the
-- anonymous role — readable and writable cross-tenant by anyone with the
-- publishable key. `secure_partition` (ENABLE ROW LEVEL SECURITY + REVOKE ALL)
-- is the only thing standing between a new partition and that, and this path
-- skipped it.
--
-- It has never fired: migration 0094 pre-created appointments through y2027m12,
-- so `partition_exists` has short-circuited every call so far, which is why all
-- 70 partitions are clean. The hole is latent, and it opens by itself in
-- January 2028 — or the first time anyone books beyond the pre-created range.
--
-- One generic helper now owns partition creation, so there is a single place
-- where hardening can be forgotten rather than three.
CREATE OR REPLACE FUNCTION public.ensure_partition_for(p_table text, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := date_trunc('month', p_date)::date;
  v_end   date := (date_trunc('month', p_date) + interval '1 month')::date;
  v_name  text := p_table || '_' || to_char(v_start, '"y"YYYY"m"MM');
BEGIN
  -- Only ever a partition of a table this migration knows to be partitioned.
  -- p_table reaches format() as an identifier, but an unknown value would still
  -- be a table created in public by a definer function, so it is rejected.
  IF p_table NOT IN ('audit_logs', 'appointments', 'visits',
                     'bill_items', 'lab_order_items', 'lab_result_analytes') THEN
    RAISE EXCEPTION 'ensure_partition_for: % is not a partitioned table', p_table;
  END IF;

  IF partition_exists(v_name) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
    v_name, p_table, v_start, v_end);

  -- Not optional. See the comment above.
  PERFORM secure_partition(v_name);

  -- No CREATE INDEX here, deliberately — see F-73 below.
END;
$function$;

-- Kept at this exact signature because two app call sites use it by name.
-- It now hardens what it creates, because it delegates.
CREATE OR REPLACE FUNCTION public.ensure_appointment_partition(p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM ensure_partition_for('appointments', p_date);
END;
$function$;

-- ---------------------------------------------------------------------------
-- F-39 — the five-minute hole at every month boundary
-- ---------------------------------------------------------------------------
-- The job ran at 00:05 on the 1st and created exactly one month. Between
-- 00:00:00 and 00:05:00 the new month's partition did not exist, and an insert
-- into visits, bill_items, lab_order_items or audit_logs failed outright with
-- "no partition of relation ... found for row". A hospital with a night shift
-- is awake then.
--
-- Scheduling at 23:55 the previous day would shrink the window, which is the
-- obvious fix and the wrong one: it keeps a design where one missed run is an
-- outage. Creating several months ahead, every day, removes the boundary from
-- the picture entirely — by the time a month begins its partition is weeks old,
-- and it now takes ~90 consecutive failures to reach a hole rather than one.

-- The old function took no arguments. CREATE OR REPLACE with a new argument
-- list would create an OVERLOAD, not a replacement, leaving the stale zero-arg
-- body callable and still carrying the single-month behaviour this fixes. It is
-- dropped explicitly.
DROP FUNCTION IF EXISTS public.create_next_month_partitions();

CREATE OR REPLACE FUNCTION public.create_next_month_partitions(p_months_ahead int DEFAULT 3)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Previously six near-identical 6-line blocks. Each one listed its own
  -- indexes, which is how appointments drifted to three and the rest to two,
  -- and how F-73's duplicates got created in the first place.
  tables text[] := ARRAY[
    'audit_logs', 'appointments', 'visits',
    'bill_items', 'lab_order_items', 'lab_result_analytes'
  ];
  t text;
  i int;
BEGIN
  IF p_months_ahead < 1 THEN
    RAISE EXCEPTION 'create_next_month_partitions: p_months_ahead must be >= 1';
  END IF;

  -- From 0, not 1: the current month is included so that a restored or
  -- freshly seeded database is immediately usable rather than usable next month.
  FOR i IN 0..p_months_ahead LOOP
    FOREACH t IN ARRAY tables LOOP
      PERFORM ensure_partition_for(t, (date_trunc('month', now()) + (i || ' months')::interval)::date);
    END LOOP;
  END LOOP;
END;
$function$;

-- ---------------------------------------------------------------------------
-- F-40 — the alarm reported to nobody
-- ---------------------------------------------------------------------------
-- The old body was `RAISE WARNING 'Missing next-month partition: %_%'`. A
-- WARNING goes to the Postgres log, which nothing reads; and because a warning
-- is not an error, cron.job_run_details.status read 'succeeded' whether or not
-- a partition was missing. There was no path from "partition missing" to "a
-- human knows", which is the whole finding.
--
-- Two outputs now, because the two readers are different: a row the app can
-- surface, and an exception so the job is recorded as failed.
CREATE TABLE IF NOT EXISTS public.partition_health (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at  timestamptz NOT NULL DEFAULT now(),
  ok          boolean NOT NULL,
  runway_months int,
  missing     text[] NOT NULL DEFAULT '{}',
  detail      text
);

-- Platform-operations data, not any tenant's. It carries no tenant_id, so RLS
-- has nothing to scope it by and the correct posture is "no client reaches it
-- at all" — which must be stated, because of the pg_default_acl grant quoted
-- above. Without these two lines this table would be world-readable.
ALTER TABLE public.partition_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partition_health FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_partition_health_checked
  ON public.partition_health (checked_at DESC);

-- One reader of the schema, two consumers. Written as a returning function
-- because the alarm and the recorder must agree by construction, not by two
-- copies of the same loop drifting apart (this audit has four findings about
-- exactly that).
CREATE OR REPLACE FUNCTION public.partition_runway()
RETURNS TABLE (missing text[], runway_months int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tables text[] := ARRAY[
    'audit_logs', 'visits', 'appointments',
    'bill_items', 'lab_order_items', 'lab_result_analytes'
  ];
  t text;
  v_missing text[] := '{}';
  v_suffix text;
  v_runway int := NULL;
  v_tbl int;
  i int;
BEGIN
  -- Next month must exist: that is the condition under which inserts start
  -- failing, and it is the only one worth waking somebody for.
  v_suffix := to_char(date_trunc('month', now() + interval '1 month'), '"y"YYYY"m"MM');
  FOREACH t IN ARRAY tables LOOP
    IF NOT partition_exists(t || '_' || v_suffix)
       AND NOT partition_exists(t || '_partitioned_' || v_suffix) THEN
      v_missing := v_missing || (t || '_' || v_suffix);
    END IF;
  END LOOP;

  -- How far ahead the thinnest table reaches, so a shrinking runway is visible
  -- while it is still shrinking rather than only once it hits zero.
  FOREACH t IN ARRAY tables LOOP
    v_tbl := 0;
    FOR i IN 1..24 LOOP
      v_suffix := to_char(date_trunc('month', now() + (i || ' months')::interval), '"y"YYYY"m"MM');
      EXIT WHEN NOT partition_exists(t || '_' || v_suffix);
      v_tbl := i;
    END LOOP;
    IF v_runway IS NULL OR v_tbl < v_runway THEN
      v_runway := v_tbl;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_missing, v_runway;
END;
$function$;

-- Records, never raises. Must not raise: an exception here would roll back the
-- very row it exists to leave behind.
CREATE OR REPLACE FUNCTION public.record_partition_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM partition_runway();
  INSERT INTO public.partition_health (ok, runway_months, missing, detail)
  VALUES (
    cardinality(r.missing) = 0,
    r.runway_months,
    r.missing,
    format('thinnest partitioned table is covered %s month(s) ahead', r.runway_months)
  );
END;
$function$;

-- Raises, never records. The two are separate functions on separate cron jobs
-- because pg_cron wraps each job in its own transaction: if one function did
-- both, the exception that makes the job show as 'failed' would also discard
-- the health row. That is the shape of the original defect — the signal and
-- the record cancelling each other out — so it is worth being explicit about.
--
-- An EXCEPTION here is what makes cron.job_run_details.status read 'failed',
-- which is the one partition signal that is visible without the app running.
CREATE OR REPLACE FUNCTION public.alert_missing_next_partition()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM partition_runway();

  IF cardinality(r.missing) > 0 THEN
    RAISE EXCEPTION
      'PARTITIONS MISSING for next month: % - inserts into these tables will fail on the 1st',
      array_to_string(r.missing, ', ');
  END IF;

  -- A runway of exactly 1 month is the state the old design ran in
  -- permanently. It is not an outage, so it does not raise, but it means the
  -- creation job has not run for a while and is worth seeing.
  IF r.runway_months <= 1 THEN
    RAISE WARNING 'partition runway down to % month(s)', r.runway_months;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- F-73 (new) — 154 redundant index copies, created monthly, forever
-- ---------------------------------------------------------------------------
-- Found while verifying F-41. The parents' indexes are PARTITIONED indexes
-- (pg_class.relkind = 'I'), so Postgres creates a matching index on every new
-- partition automatically. The cron function then created its own copies by
-- hand on top of those. Measured, not inferred:
--
--   visits_y2026m04 .. m08  (migration-created)  7 indexes
--   visits_y2026m09 .. m12  (cron-created)       9 indexes
--
-- The two extras are exact duplicates of inherited ones. Across all partitions:
-- 58 such copies, every one of which has an exact-signature inherited twin, and
-- none of which is UNIQUE or a primary key — so none carries a constraint that
-- dropping it would remove. That query is reproduced as the WHERE clause below,
-- so the drop re-derives its own safety rather than trusting a count I took
-- once.
--
-- Separately, migration 0012 re-created six indexes that 0011 had already
-- created, under different names, on appointments, audit_logs and visits. Those
-- duplicates are at the PARENT level, so each one is propagated to every
-- partition: 3 x 21 + 2 x 9 + 1 x 9 = 90 more copies. 0011's names are kept.
--
-- Cost of leaving it: every insert into visits maintains 9 index entries where
-- 7 would do, on the hot clinical write path, and the bill grows by two indexes
-- per table per month for as long as the hospital runs. The storage (888 kB
-- today) is not the point; the write amplification is.

DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    WITH parts AS (
      SELECT p.oid, p.relname AS part
        FROM pg_class c
        JOIN pg_inherits inh ON inh.inhparent = c.oid
        JOIN pg_class p ON p.oid = inh.inhrelid
       WHERE c.relkind = 'p'
    ),
    idx AS (
      SELECT parts.part,
             i.relname AS idx,
             EXISTS (SELECT 1 FROM pg_inherits pi WHERE pi.inhrelid = i.oid) AS attached,
             regexp_replace(pg_get_indexdef(i.oid), '^CREATE (UNIQUE )?INDEX \S+ ON \S+ ', '') AS sig,
             (ix.indisunique OR ix.indisprimary) AS protected
        FROM parts
        JOIN pg_index ix ON ix.indrelid = parts.oid
        JOIN pg_class i ON i.oid = ix.indexrelid
    )
    SELECT o.idx
      FROM idx o
     WHERE NOT o.attached            -- not managed by the parent
       AND NOT o.protected           -- carries no uniqueness
       AND EXISTS (                  -- and an inherited index already covers it
             SELECT 1 FROM idx a
              WHERE a.part = o.part AND a.attached AND a.sig = o.sig
           )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.idx);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'F-73: dropped % redundant partition-local indexes', n;
END $$;

-- The parent-level duplicates from 0012. Dropping a partitioned index drops its
-- children with it, so these six statements remove 90 index copies.
DROP INDEX IF EXISTS public.idx_appointments_doctor_scheduled;   -- = idx_appt_doctor_scheduled
DROP INDEX IF EXISTS public.idx_appointments_patient_scheduled;  -- = idx_appt_patient_scheduled
DROP INDEX IF EXISTS public.idx_appointments_status_scheduled;   -- = idx_appt_status_scheduled
DROP INDEX IF EXISTS public.idx_audit_tenant_actor_created;      -- = idx_audit_logs_actor
DROP INDEX IF EXISTS public.idx_audit_tenant_entity;             -- = idx_audit_logs_entity
DROP INDEX IF EXISTS public.idx_visits_tenant_patient_date;      -- = idx_visits_patient_date

-- Three more on non-partitioned tables, found by the same scan widened to the
-- whole schema. In each case a plain index duplicates the index behind a UNIQUE
-- constraint, which serves the same lookups; the unique one is kept.
DROP INDEX IF EXISTS public.idx_lab_samples_order;         -- = lab_samples_tube_key (unique)
DROP INDEX IF EXISTS public.idx_partners_tenant;           -- = partners_tenant_id_key (unique)
DROP INDEX IF EXISTS public.attendance_profile_date_idx;   -- = staff_attendance_profile_id_date_key (unique)

-- ---------------------------------------------------------------------------
-- F-41 — one table protected twice, five protected once
-- ---------------------------------------------------------------------------
-- appointments had 14 months of runway (migration 0094 pre-created it) while
-- visits, bills, lab orders and audit relied solely on the monthly job, so a
-- failure of that job took down everything except appointments. The
-- inconsistency is resolved by making the generous case the rule: one job,
-- running daily, covering all six tables several months out.
SELECT cron.schedule(
  'create-next-month-partitions',
  '20 0 * * *',
  $$SELECT create_next_month_partitions(3)$$
);

-- Health row first, alarm second, five minutes apart: the alarm aborts its own
-- transaction by design, so it cannot be the thing that writes the record.
SELECT cron.schedule(
  'record-partition-health',
  '0 9 * * *',
  $$SELECT record_partition_health()$$
);

SELECT cron.schedule(
  'alert-missing-partitions',
  '5 9 * * *',
  $$SELECT alert_missing_next_partition()$$
);

-- Create the runway immediately rather than waiting for 00:20 tomorrow: today
-- is the 1st, so every table except appointments currently ends next month.
SELECT create_next_month_partitions(3);
SELECT record_partition_health();

COMMIT;
