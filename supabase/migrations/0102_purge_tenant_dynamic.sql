-- =====================================================================
-- 0102_purge_tenant_dynamic.sql
-- Make purge_tenant_data self-maintaining. The previous version was a
-- hand-written list of DELETE FROM statements that silently drifted out of
-- sync as new tables were added (scheduling, insurance master, blood config,
-- notification_templates, etc. were never purged). Replace it with a dynamic
-- sweep of EVERY table that has a tenant_id column, so nothing is ever missed
-- again. FK ordering is neutralised with session_replication_role='replica'.
--
-- Preserved on purpose: the tenants row (marked 'purged' for audit),
-- subscriptions (billing history), and platform_admin_audit (records the purge
-- itself). Partition CHILD tables are skipped — deleting the partitioned parent
-- covers them. Auth users are removed in the action layer (platform.ts), not
-- here, since auth.users lives outside this schema.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.purge_tenant_data(p_tenant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  r record;
BEGIN
  -- Bypass FK enforcement + triggers for this transaction so delete order
  -- across tenant tables doesn't matter. (is_local = true → auto-reverts.)
  PERFORM set_config('session_replication_role', 'replica', true);

  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
      AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')          -- ordinary + partitioned-parent tables
      AND NOT c.relispartition             -- skip partition children (parent covers them)
      AND c.relname NOT IN ('subscriptions', 'platform_admin_audit')  -- preserved
  LOOP
    -- tenant_id::text handles both UUID and the one TEXT tenant_id column.
    EXECUTE format('DELETE FROM public.%I WHERE tenant_id::text = %L', r.relname, p_tenant_id::text);
  END LOOP;

  PERFORM set_config('session_replication_role', 'origin', true);

  -- Keep subscription row for billing history; keep tenant row for audit.
  UPDATE subscriptions SET status = 'cancelled' WHERE tenant_id = p_tenant_id;
  UPDATE tenants       SET status = 'purged'    WHERE id = p_tenant_id;
END;
$$;
