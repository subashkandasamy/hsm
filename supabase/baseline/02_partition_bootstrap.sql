-- ============================================================================
-- Uyirly HMS — Consolidated Baseline  ·  FILE 02: PARTITION BOOTSTRAP
-- ============================================================================
-- Run AFTER 01_schema.sql.
--
-- 01_schema.sql recreates the exact live partitions (which are anchored to
-- 2026). A database created at any other time needs partitions covering the
-- CURRENT window, or inserts of new rows will fail with "no partition of
-- relation ... found for row". This file creates a rolling window around today
-- and schedules the monthly auto-creation job.
--
-- The 5 range-partitioned tables and their partition key:
--   audit_logs      (created_at)      appointments (scheduled_at)
--   visits          (visit_date)      bill_items   (created_at)
--   lab_order_items (created_at)
--
-- New partitions automatically inherit the parent's indexes (the parent indexes
-- are partitioned), so we only create the partition itself here.
-- partition_exists() is defined in 01_schema.sql.
-- ============================================================================

DO $$
DECLARE
  tbl       text;
  tables    text[] := ARRAY['audit_logs','appointments','visits','bill_items','lab_order_items'];
  m_start   date;
  m_end     date;
  suffix    text;
  part_name text;
  -- window: previous month through 12 months ahead
  d0        date := date_trunc('month', now())::date - interval '1 month';
  i         int;
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOR i IN 0..13 LOOP
      m_start   := (d0 + (i || ' month')::interval)::date;
      m_end     := (m_start + interval '1 month')::date;
      suffix    := to_char(m_start, '"y"YYYY"m"MM');
      part_name := tbl || '_' || suffix;
      IF NOT partition_exists(part_name) THEN
        EXECUTE format(
          'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
          part_name, tbl, m_start, m_end);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Ongoing automation: create next month's partitions on the 1st, 00:05 UTC.
-- Requires pg_cron (see 00_prerequisites.sql). Safe to skip if pg_cron is
-- unavailable — instead call create_next_month_partitions() from an external
-- scheduler. Guarded so re-running this file does not error on a duplicate job.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'create-next-month-partitions') THEN
      PERFORM cron.schedule(
        'create-next-month-partitions',
        '5 0 1 * *',
        'SELECT create_next_month_partitions()');
    END IF;
    -- Refresh dashboard materialized views every 5 minutes.
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-dashboard-views') THEN
      PERFORM cron.schedule(
        'refresh-dashboard-views',
        '*/5 * * * *',
        'SELECT refresh_dashboard_views()');
    END IF;
  ELSE
    RAISE NOTICE 'pg_cron not installed — schedule create_next_month_partitions() and refresh_dashboard_views() externally.';
  END IF;
END $$;
