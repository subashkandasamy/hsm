-- Dashboard views: IST days + close public access ────────────────────────────
--
-- 1. SECURITY — materialized views cannot have row-level security, yet all five
--    dashboard views granted full access to anon and authenticated. With only the
--    public anon key (shipped in the site's JavaScript) anyone could read every
--    hospital's daily revenue, footfall, pending-bill totals and bed occupancy
--    (verified: HTTP 200 across tenants). The app reads them only with the service
--    role (getReadClient), so API-role access is revoked. v_replication_lag (runs
--    as owner, would expose replica addresses, unused by the app) likewise.
--
-- 2. IST — mv_daily_revenue_by_tenant and mv_daily_footfall_by_tenant bucketed
--    days in UTC, so the dashboard's "today" (now IST) would miss 00:00–05:30 IST
--    and count the previous evening. Rebuilt on Asia/Kolkata days.

-- ── IST rebuild (same shape, same unique indexes for CONCURRENT refresh) ─────
DROP MATERIALIZED VIEW IF EXISTS mv_daily_revenue_by_tenant;
CREATE MATERIALIZED VIEW mv_daily_revenue_by_tenant AS
  SELECT tenant_id,
         (received_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
         sum(amount)::numeric(14,2) AS total_amount
  FROM payments
  GROUP BY tenant_id, (received_at AT TIME ZONE 'Asia/Kolkata')::date;
CREATE UNIQUE INDEX mv_daily_revenue_pk ON mv_daily_revenue_by_tenant (tenant_id, day);

DROP MATERIALIZED VIEW IF EXISTS mv_daily_footfall_by_tenant;
CREATE MATERIALIZED VIEW mv_daily_footfall_by_tenant AS
  SELECT tenant_id, day, sum(cnt) AS total_footfall
  FROM (
    SELECT tenant_id, (scheduled_at AT TIME ZONE 'Asia/Kolkata')::date AS day, count(*) AS cnt
    FROM appointments
    GROUP BY tenant_id, (scheduled_at AT TIME ZONE 'Asia/Kolkata')::date
    UNION ALL
    SELECT tenant_id, (arrived_at AT TIME ZONE 'Asia/Kolkata')::date AS day, count(*) AS cnt
    FROM emergency_cases
    GROUP BY tenant_id, (arrived_at AT TIME ZONE 'Asia/Kolkata')::date
  ) sub
  GROUP BY tenant_id, day;
CREATE UNIQUE INDEX mv_daily_footfall_pk ON mv_daily_footfall_by_tenant (tenant_id, day);

-- ── Lock down: service role only ──────────────────────────────────────────────
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'mv_daily_revenue_by_tenant', 'mv_daily_footfall_by_tenant', 'mv_pending_bills_by_tenant',
    'mv_bed_occupancy_by_tenant', 'mv_lowstock_alerts_by_tenant'
  ] LOOP
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated, PUBLIC', v);
    EXECUTE format('GRANT SELECT ON %I TO service_role', v);
  END LOOP;
END;
$$;

REVOKE ALL ON v_replication_lag FROM anon, authenticated, PUBLIC;
GRANT SELECT ON v_replication_lag TO service_role;

NOTIFY pgrst, 'reload schema';
