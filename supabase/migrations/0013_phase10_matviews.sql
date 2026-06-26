-- ============================================================================
-- Phase 10.6 — Materialized Views for Dashboard KPIs
-- ============================================================================
-- Each view is pre-aggregated by (tenant_id, day) so the admin dashboard
-- reads a single indexed row per tenant instead of scanning fact tables.
-- Refreshed every 5 minutes via pg_cron (CONCURRENTLY to avoid read locks).
-- ============================================================================

-- ── mv_daily_revenue_by_tenant ────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_revenue_by_tenant AS
SELECT
  tenant_id,
  (received_at AT TIME ZONE 'UTC')::date AS day,
  SUM(amount)::numeric(14,2)             AS total_amount
FROM payments
GROUP BY tenant_id, (received_at AT TIME ZONE 'UTC')::date
WITH DATA;

-- Unique index required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS mv_daily_revenue_pk
  ON mv_daily_revenue_by_tenant (tenant_id, day);

-- ── mv_bed_occupancy_by_tenant ────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_bed_occupancy_by_tenant AS
SELECT
  tenant_id,
  COUNT(*)                                                    AS total_beds,
  COUNT(*) FILTER (WHERE status = 'occupied')                 AS occupied_beds,
  COUNT(*) FILTER (WHERE status = 'available')                AS available_beds,
  COUNT(*) FILTER (WHERE status = 'maintenance')              AS maintenance_beds
FROM beds
GROUP BY tenant_id
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_bed_occupancy_pk
  ON mv_bed_occupancy_by_tenant (tenant_id);

-- ── mv_daily_footfall_by_tenant ───────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_footfall_by_tenant AS
SELECT tenant_id, day, SUM(cnt) AS total_footfall
FROM (
  SELECT
    tenant_id,
    (scheduled_at AT TIME ZONE 'UTC')::date AS day,
    COUNT(*) AS cnt
  FROM appointments
  GROUP BY tenant_id, (scheduled_at AT TIME ZONE 'UTC')::date

  UNION ALL

  SELECT
    tenant_id,
    (arrived_at AT TIME ZONE 'UTC')::date AS day,
    COUNT(*) AS cnt
  FROM emergency_cases
  GROUP BY tenant_id, (arrived_at AT TIME ZONE 'UTC')::date
) sub
GROUP BY tenant_id, day
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_daily_footfall_pk
  ON mv_daily_footfall_by_tenant (tenant_id, day);

-- ── mv_lowstock_alerts_by_tenant ──────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_lowstock_alerts_by_tenant AS
SELECT
  tenant_id,
  COUNT(*) FILTER (WHERE qty_in_stock <= reorder_level) AS low_stock_count,
  COUNT(*) FILTER (WHERE qty_in_stock = 0)              AS out_of_stock_count
FROM inventory_items
WHERE is_active = true
GROUP BY tenant_id
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_lowstock_alerts_pk
  ON mv_lowstock_alerts_by_tenant (tenant_id);

-- ── mv_pending_bills_by_tenant ────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_pending_bills_by_tenant AS
SELECT
  tenant_id,
  COUNT(*)                AS pending_count,
  SUM(total)::numeric(14,2) AS pending_total
FROM bills
WHERE status IN ('unpaid', 'partial')
GROUP BY tenant_id
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_pending_bills_pk
  ON mv_pending_bills_by_tenant (tenant_id);

-- ============================================================================
-- Refresh function + pg_cron job (every 5 minutes)
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_dashboard_views()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_revenue_by_tenant;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bed_occupancy_by_tenant;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_footfall_by_tenant;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_lowstock_alerts_by_tenant;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_pending_bills_by_tenant;
END;
$$;

SELECT cron.schedule(
  'refresh-dashboard-matviews',
  '*/5 * * * *',
  'SELECT refresh_dashboard_views()'
);

-- ============================================================================
-- Phase 10.8 — Monitoring: missing-partition alert
-- ============================================================================
CREATE OR REPLACE FUNCTION alert_missing_next_partition()
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  next_suffix text := to_char(date_trunc('month', now() + interval '1 month'), '"y"YYYY"m"MM');
  tables text[] := ARRAY[
    'audit_logs', 'visits', 'appointments', 'bill_items', 'lab_order_items'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT partition_exists(t || '_partitioned_' || next_suffix)
       AND NOT partition_exists(t || '_' || next_suffix)
    THEN
      RAISE WARNING 'Missing next-month partition: %_%', t, next_suffix;
    END IF;
  END LOOP;
END;
$$;

-- Alert check runs daily at 09:00 UTC
SELECT cron.schedule(
  'alert-missing-partitions',
  '0 9 * * *',
  'SELECT alert_missing_next_partition()'
);

-- ============================================================================
-- Phase 10.8 — replication lag monitoring view
-- (read from pg_stat_replication on primary; works as a view for platform admins)
-- ============================================================================
CREATE OR REPLACE VIEW v_replication_lag AS
SELECT
  client_addr,
  state,
  sent_lsn,
  write_lsn,
  flush_lsn,
  replay_lsn,
  (sent_lsn - replay_lsn)   AS lag_bytes,
  EXTRACT(EPOCH FROM write_lag)  AS write_lag_seconds,
  EXTRACT(EPOCH FROM flush_lag)  AS flush_lag_seconds,
  EXTRACT(EPOCH FROM replay_lag) AS replay_lag_seconds,
  now() AS checked_at
FROM pg_stat_replication;

COMMENT ON VIEW v_replication_lag IS
  'Live replication lag per replica slot. Query on primary only.';
