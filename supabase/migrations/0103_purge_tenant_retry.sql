-- =====================================================================
-- 0103_purge_tenant_retry.sql
-- 0102 tried session_replication_role='replica' to ignore FK order, but that
-- needs superuser and is blocked on Supabase (the RPC 403'd). Replace it with a
-- dependency-safe dynamic sweep that needs NO elevated privilege: delete from
-- every tenant-scoped table in repeated passes, catching FK violations (child
-- still referenced) and retrying on the next pass until a full pass deletes
-- nothing. Still self-maintaining — any table with a tenant_id column is
-- included automatically, so the purge can never drift out of sync again.
--
-- Preserved: tenants (marked 'purged'), subscriptions (billing history),
-- platform_admin_audit (records the purge). Partition children skipped (parent
-- covers them). Auth users are removed in the action layer (platform.ts).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.purge_tenant_data(p_tenant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  r            record;
  v_rowcount   integer;
  v_pass       integer := 0;
  v_progress   boolean;
BEGIN
  LOOP
    v_pass := v_pass + 1;
    v_progress := false;

    FOR r IN
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
        AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')          -- ordinary + partitioned-parent tables
        AND NOT c.relispartition             -- skip partition children (parent covers them)
        AND c.relname NOT IN ('subscriptions', 'platform_admin_audit', 'tenants')
    LOOP
      BEGIN
        -- tenant_id::text handles both UUID and the one TEXT tenant_id column.
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id::text = %L', r.relname, p_tenant_id::text);
        GET DIAGNOSTICS v_rowcount = ROW_COUNT;
        IF v_rowcount > 0 THEN v_progress := true; END IF;
      EXCEPTION WHEN foreign_key_violation THEN
        -- Still referenced by a child not yet purged — leave it for the next pass.
        NULL;
      END;
    END LOOP;

    EXIT WHEN NOT v_progress OR v_pass >= 25;
  END LOOP;

  -- Keep subscription row for billing history; keep tenant row for audit.
  UPDATE subscriptions SET status = 'cancelled' WHERE tenant_id = p_tenant_id;
  UPDATE tenants       SET status = 'purged'    WHERE id = p_tenant_id;
END;
$$;
