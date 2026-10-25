-- Put back the lock that 0225 took off by accident.
--
-- 0133 revoked these views from anon and authenticated and granted them to
-- service_role alone. The reason is structural: **a materialized view cannot
-- carry row-level security**, so there is nothing inside it to keep one
-- hospital's rows away from another's. Reachability is the only boundary, and
-- these aggregate every tenant in the database into one table.
--
-- 0225 rebuilt mv_daily_revenue_by_tenant to fix its definition, and a
-- DROP ... CREATE starts the object's privileges from scratch — where
-- Supabase's default grants hand SELECT to anon and authenticated. The fix
-- for one bug silently opened every tenant's daily collections to any signed-
-- in user, and to unauthenticated requests as well.
--
-- Applied to all five rather than only the one, so a future rebuild of any of
-- them is covered by a migration that already exists. Anything that needs to
-- read one must go through the service-role client and filter by tenant_id
-- itself — there is no safety net underneath.

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

NOTIFY pgrst, 'reload schema';
