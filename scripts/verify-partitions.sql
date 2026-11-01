-- Read-only check on the partition machinery. Raises by design, so it cannot
-- alter anything even if it is run against the live database by mistake.
--
-- Covers what migration 0248 fixed, as four questions:
--   1. runway   — how many months ahead is the thinnest table covered?
--   2. hardened — is any partition missing RLS or still granted to anon?
--   3. dupes    — has a redundant index copy come back?
--   4. jobs     — are the three cron jobs registered, and did they last succeed?
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/verify-partitions.sql

DO $$
DECLARE
  v_runway int;
  v_missing text[];
  v_unhardened int;
  v_dupes int;
  v_jobs int;
  v_failed text;
  r record;
BEGIN
  SELECT missing, runway_months INTO v_missing, v_runway FROM partition_runway();

  -- A new partition is created with ALL privileges granted to anon and
  -- authenticated (pg_default_acl) and with RLS off, so this is the check that
  -- matters most: anything listed here is readable cross-tenant.
  SELECT count(*) INTO v_unhardened
    FROM pg_class c
    JOIN pg_inherits inh ON inh.inhparent = c.oid
    JOIN pg_class p ON p.oid = inh.inhrelid
   WHERE c.relkind = 'p'
     AND (p.relrowsecurity = false OR has_table_privilege('anon', p.oid, 'SELECT'));

  WITH parts AS (
    SELECT p.oid, p.relname AS part
      FROM pg_class c
      JOIN pg_inherits inh ON inh.inhparent = c.oid
      JOIN pg_class p ON p.oid = inh.inhrelid
     WHERE c.relkind = 'p'
  ),
  idx AS (
    SELECT parts.part, i.relname AS idx,
           EXISTS (SELECT 1 FROM pg_inherits pi WHERE pi.inhrelid = i.oid) AS attached,
           regexp_replace(pg_get_indexdef(i.oid), '^CREATE (UNIQUE )?INDEX \S+ ON \S+ ', '') AS sig,
           (ix.indisunique OR ix.indisprimary) AS protected
      FROM parts
      JOIN pg_index ix ON ix.indrelid = parts.oid
      JOIN pg_class i ON i.oid = ix.indexrelid
  )
  SELECT count(*) INTO v_dupes
    FROM idx o
   WHERE NOT o.attached AND NOT o.protected
     AND EXISTS (SELECT 1 FROM idx a WHERE a.part = o.part AND a.attached AND a.sig = o.sig);

  SELECT count(*) INTO v_jobs FROM cron.job
   WHERE jobname IN ('create-next-month-partitions', 'record-partition-health', 'alert-missing-partitions');

  -- Most recent outcome per job, so a silently failing creation job shows up
  -- here rather than only on the 1st of next month.
  v_failed := '';
  FOR r IN
    SELECT j.jobname, d.status, d.end_time
      FROM cron.job j
      LEFT JOIN LATERAL (
        SELECT status, end_time FROM cron.job_run_details d
         WHERE d.jobid = j.jobid ORDER BY d.start_time DESC LIMIT 1
      ) d ON true
     WHERE j.jobname IN ('create-next-month-partitions', 'record-partition-health', 'alert-missing-partitions')
  LOOP
    IF r.status IS DISTINCT FROM 'succeeded' THEN
      v_failed := v_failed || format('%s=%s ', r.jobname, coalesce(r.status, 'never run'));
    END IF;
  END LOOP;

  RAISE EXCEPTION E'\n'
    'PARTITION HEALTH\n'
    '  runway (thinnest)   : % month(s)%\n'
    '  missing next month  : %\n'
    '  unhardened partitions: %   <- must be 0 (no RLS, or anon can SELECT)\n'
    '  redundant indexes   : %   <- must be 0\n'
    '  cron jobs registered: % of 3\n'
    '  last run not ok     : %',
    v_runway,
    CASE WHEN v_runway <= 1 THEN '   <- too thin, the creation job may be failing' ELSE '' END,
    CASE WHEN cardinality(v_missing) = 0 THEN 'none' ELSE array_to_string(v_missing, ', ') END,
    v_unhardened,
    v_dupes,
    v_jobs,
    CASE WHEN v_failed = '' THEN 'none' ELSE v_failed END;
END $$;
