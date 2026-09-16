-- Lock down monthly partitions ────────────────────────────────────────────────
-- appointments, visits, bill_items, lab_order_items and audit_logs are
-- partitioned by month. The monthly job create_next_month_partitions() created
-- each new partition WITHOUT row-level security, and Supabase's default
-- privileges give anon/authenticated full access to every new public table. So
-- since the September rollover those partitions had RLS off with full grants.
-- (Not reachable through the REST API today — PostgREST hides partitions — but
-- any direct path would have bypassed tenant isolation.)
--
-- Partitions are only ever used through their parent table, and Postgres checks
-- privileges and RLS on the table named in the query — so enabling RLS (with no
-- policies) and revoking API-role grants on partitions changes nothing for the
-- app, while closing direct access. Verified in a rolled-back transaction as a
-- real staff user: read + insert through bill_items still work.

CREATE OR REPLACE FUNCTION secure_partition(p_table text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', p_table);
END;
$$;
REVOKE ALL ON FUNCTION secure_partition(text) FROM PUBLIC, anon, authenticated;

-- ── 1. Secure every existing partition ───────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT child.relname
    FROM pg_inherits i
    JOIN pg_class child  ON child.oid  = i.inhrelid
    JOIN pg_class parent ON parent.oid = i.inhparent
    JOIN pg_namespace n  ON n.oid = parent.relnamespace AND n.nspname = 'public'
    WHERE parent.relkind = 'p' AND child.relkind IN ('r', 'p')
  LOOP
    PERFORM secure_partition(r.relname);
  END LOOP;
END;
$$;

-- ── 2. New monthly partitions are secured as they're created ─────────────────
-- Same body as the live function, plus secure_partition() after each CREATE.
CREATE OR REPLACE FUNCTION public.create_next_month_partitions()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  p_start date := date_trunc('month', now() + interval '1 month')::date;
  p_end   date := (p_start + interval '1 month')::date;
  suffix  text := to_char(p_start, '"y"YYYY"m"MM');
BEGIN
  IF NOT partition_exists('audit_logs_' || suffix) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'audit_logs_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, created_at DESC)', 'audit_logs_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, entity, entity_id, created_at DESC)', 'audit_logs_' || suffix);
    PERFORM secure_partition('audit_logs_' || suffix);
  END IF;

  IF NOT partition_exists('appointments_' || suffix) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF appointments FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'appointments_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, scheduled_at)', 'appointments_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, doctor_id, scheduled_at)', 'appointments_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, patient_id, scheduled_at DESC)', 'appointments_' || suffix);
    PERFORM secure_partition('appointments_' || suffix);
  END IF;

  IF NOT partition_exists('visits_' || suffix) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF visits FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'visits_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, visit_date DESC)', 'visits_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, patient_id, visit_date DESC)', 'visits_' || suffix);
    PERFORM secure_partition('visits_' || suffix);
  END IF;

  IF NOT partition_exists('bill_items_' || suffix) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF bill_items FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'bill_items_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (bill_id, created_at DESC)', 'bill_items_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, created_at DESC)', 'bill_items_' || suffix);
    PERFORM secure_partition('bill_items_' || suffix);
  END IF;

  IF NOT partition_exists('lab_order_items_' || suffix) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF lab_order_items FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'lab_order_items_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (lab_order_id, created_at DESC)', 'lab_order_items_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, created_at DESC)', 'lab_order_items_' || suffix);
    PERFORM secure_partition('lab_order_items_' || suffix);
  END IF;

  RAISE NOTICE 'Partitions ready for %', suffix;
END;
$function$;
