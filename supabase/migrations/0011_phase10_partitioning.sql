-- ============================================================================
-- Phase 10.1 — Table Partitioning by Month (dev-mode: drop + recreate)
-- ============================================================================
-- We drop each target table with CASCADE (removes dependent FK constraints
-- on child tables), then recreate it as a PARTITION BY RANGE table.
--
-- PostgreSQL rule: the partition key MUST be part of the PRIMARY KEY.
-- Consequence: PKs become (id, <partition_col>), so FKs from other tables
-- that reference only `id` cannot be re-declared as FK constraints — they
-- become app-enforced references. FKs *from* these tables to non-partitioned
-- tables (patients, profiles, tenants, bills …) are recreated normally.
--
-- Tables partitioned here:
--   audit_logs       → RANGE on created_at     (TIMESTAMPTZ)
--   appointments     → RANGE on scheduled_at   (TIMESTAMPTZ)
--   visits           → RANGE on visit_date     (TIMESTAMPTZ)
--   bill_items       → RANGE on created_at     (TIMESTAMPTZ) [column added]
--   lab_order_items  → RANGE on created_at     (TIMESTAMPTZ) [column added]
-- ============================================================================

-- ── Enable pg_cron ─────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA cron TO postgres;

-- ── Partition existence helper ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION partition_exists(p_name text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = p_name AND c.relkind = 'r'
  );
$$;

-- ============================================================================
-- 1. audit_logs
-- ============================================================================
-- Child tables with FKs INTO audit_logs: none (it is a leaf log table).
DROP TABLE IF EXISTS audit_logs CASCADE;

CREATE TABLE audit_logs (
  id         uuid        NOT NULL,
  actor_id   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  action     text        NOT NULL,
  entity     text        NOT NULL,
  entity_id  uuid,
  meta       jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_tenant_insert" ON audit_logs
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
CREATE POLICY "audit_logs_tenant_admin_read" ON audit_logs
  FOR SELECT USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

-- Monthly partitions Apr–Aug 2026
DO $$ BEGIN
  IF NOT partition_exists('audit_logs_y2026m04') THEN
    CREATE TABLE audit_logs_y2026m04 PARTITION OF audit_logs
      FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
  END IF;
  IF NOT partition_exists('audit_logs_y2026m05') THEN
    CREATE TABLE audit_logs_y2026m05 PARTITION OF audit_logs
      FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
  END IF;
  IF NOT partition_exists('audit_logs_y2026m06') THEN
    CREATE TABLE audit_logs_y2026m06 PARTITION OF audit_logs
      FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
  END IF;
  IF NOT partition_exists('audit_logs_y2026m07') THEN
    CREATE TABLE audit_logs_y2026m07 PARTITION OF audit_logs
      FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
  END IF;
  IF NOT partition_exists('audit_logs_y2026m08') THEN
    CREATE TABLE audit_logs_y2026m08 PARTITION OF audit_logs
      FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
  END IF;
END $$;

CREATE INDEX idx_audit_logs_tenant_created ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity         ON audit_logs (tenant_id, entity, entity_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor          ON audit_logs (tenant_id, actor_id, created_at DESC);

-- ============================================================================
-- 2. appointments
-- ============================================================================
-- Child tables with FKs INTO appointments:
--   visits.appointment_id → appointments(id)  [CASCADE drops the FK; not re-added
--                           because appointments.id alone is no longer a unique key]
DROP TABLE IF EXISTS appointments CASCADE;

CREATE TABLE appointments (
  id            uuid        NOT NULL,
  tenant_id     uuid        NOT NULL REFERENCES tenants(id),
  patient_id    uuid        NOT NULL REFERENCES patients(id),
  doctor_id     uuid        NOT NULL REFERENCES profiles(id),
  department_id uuid        REFERENCES departments(id),
  scheduled_at  timestamptz NOT NULL,
  token_no      int,
  status        text        NOT NULL DEFAULT 'booked'
                            CHECK (status IN ('booked','checked_in','done','cancelled','no_show')),
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, scheduled_at)
) PARTITION BY RANGE (scheduled_at);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments_tenant_read" ON appointments FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_active = true
      AND p.tenant_id = current_tenant_id() AND p.role IN ('admin','doctor','nurse','receptionist'))
  );
CREATE POLICY "appointments_tenant_write" ON appointments FOR INSERT
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_active = true
      AND p.tenant_id = current_tenant_id() AND p.role IN ('admin','doctor','nurse','receptionist'))
  );
CREATE POLICY "appointments_tenant_update" ON appointments FOR UPDATE
  USING (
    tenant_id = current_tenant_id()
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_active = true
      AND p.tenant_id = current_tenant_id() AND p.role IN ('admin','doctor','nurse','receptionist'))
  );

DO $$ BEGIN
  IF NOT partition_exists('appointments_y2026m04') THEN
    CREATE TABLE appointments_y2026m04 PARTITION OF appointments
      FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
  END IF;
  IF NOT partition_exists('appointments_y2026m05') THEN
    CREATE TABLE appointments_y2026m05 PARTITION OF appointments
      FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
  END IF;
  IF NOT partition_exists('appointments_y2026m06') THEN
    CREATE TABLE appointments_y2026m06 PARTITION OF appointments
      FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
  END IF;
  IF NOT partition_exists('appointments_y2026m07') THEN
    CREATE TABLE appointments_y2026m07 PARTITION OF appointments
      FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
  END IF;
  IF NOT partition_exists('appointments_y2026m08') THEN
    CREATE TABLE appointments_y2026m08 PARTITION OF appointments
      FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
  END IF;
END $$;

CREATE INDEX idx_appt_tenant_scheduled     ON appointments (tenant_id, scheduled_at);
CREATE INDEX idx_appt_doctor_scheduled     ON appointments (tenant_id, doctor_id, scheduled_at);
CREATE INDEX idx_appt_patient_scheduled    ON appointments (tenant_id, patient_id, scheduled_at DESC);
CREATE INDEX idx_appt_status_scheduled     ON appointments (tenant_id, status, scheduled_at)
  WHERE status IN ('booked', 'checked_in');

-- ============================================================================
-- 3. visits
-- ============================================================================
-- Child tables with FKs INTO visits:
--   prescriptions.visit_id      → visits(id)  [FK dropped by CASCADE; app-enforced]
--   lab_orders.visit_id         → visits(id)  [FK dropped by CASCADE; app-enforced]
--   radiology_orders.visit_id   → visits(id)  [FK dropped by CASCADE; app-enforced]
-- visits.appointment_id was already dropped above (appointments CASCADE).
DROP TABLE IF EXISTS visits CASCADE;

CREATE TABLE visits (
  id             uuid        NOT NULL,
  tenant_id      uuid        NOT NULL REFERENCES tenants(id),
  patient_id     uuid        NOT NULL REFERENCES patients(id),
  doctor_id      uuid        NOT NULL REFERENCES profiles(id),
  -- appointment_id is kept as a plain column (app-level reference; no FK
  -- because appointments.id is no longer a standalone unique constraint)
  appointment_id uuid,
  type           text        NOT NULL DEFAULT 'opd',
  visit_date     timestamptz NOT NULL DEFAULT now(),
  vitals         jsonb,
  complaint      text,
  diagnosis      text,
  icd_code       text,
  notes          text,
  status         text        NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open','closed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, visit_date)
) PARTITION BY RANGE (visit_date);

ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visits_tenant_read" ON visits FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_active = true
      AND p.tenant_id = current_tenant_id() AND p.role IN ('admin','doctor','nurse','receptionist'))
  );
CREATE POLICY "visits_tenant_write" ON visits FOR INSERT
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_active = true
      AND p.tenant_id = current_tenant_id() AND p.role IN ('admin','doctor','nurse'))
  );
CREATE POLICY "visits_tenant_update" ON visits FOR UPDATE
  USING (
    tenant_id = current_tenant_id()
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_active = true
      AND p.tenant_id = current_tenant_id() AND p.role IN ('admin','doctor','nurse'))
  );

DO $$ BEGIN
  IF NOT partition_exists('visits_y2026m04') THEN
    CREATE TABLE visits_y2026m04 PARTITION OF visits
      FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
  END IF;
  IF NOT partition_exists('visits_y2026m05') THEN
    CREATE TABLE visits_y2026m05 PARTITION OF visits
      FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
  END IF;
  IF NOT partition_exists('visits_y2026m06') THEN
    CREATE TABLE visits_y2026m06 PARTITION OF visits
      FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
  END IF;
  IF NOT partition_exists('visits_y2026m07') THEN
    CREATE TABLE visits_y2026m07 PARTITION OF visits
      FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
  END IF;
  IF NOT partition_exists('visits_y2026m08') THEN
    CREATE TABLE visits_y2026m08 PARTITION OF visits
      FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
  END IF;
END $$;

CREATE INDEX idx_visits_tenant_date        ON visits (tenant_id, visit_date DESC);
CREATE INDEX idx_visits_patient_date       ON visits (tenant_id, patient_id, visit_date DESC);
CREATE INDEX idx_visits_doctor_date        ON visits (tenant_id, doctor_id, visit_date DESC);
CREATE INDEX idx_visits_appt_id            ON visits (appointment_id) WHERE appointment_id IS NOT NULL;

-- ============================================================================
-- 4. bill_items
-- ============================================================================
-- bill_items had no created_at column; we add it here.
-- Child tables with FKs INTO bill_items: none (leaf table).
DROP TABLE IF EXISTS bill_items CASCADE;

CREATE TABLE bill_items (
  id          uuid        NOT NULL,
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  bill_id     uuid        NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  source      text        NOT NULL
              CHECK (source IN ('consultation','bed','lab','radiology','pharmacy','ot','ot_consumable','blood','manual')),
  ref_id      uuid,
  description text        NOT NULL,
  qty         numeric     NOT NULL DEFAULT 1,
  unit_price  numeric     NOT NULL DEFAULT 0,
  amount      numeric     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bill_items_tenant_all" ON bill_items FOR ALL
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

DO $$ BEGIN
  IF NOT partition_exists('bill_items_y2026m04') THEN
    CREATE TABLE bill_items_y2026m04 PARTITION OF bill_items
      FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
  END IF;
  IF NOT partition_exists('bill_items_y2026m05') THEN
    CREATE TABLE bill_items_y2026m05 PARTITION OF bill_items
      FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
  END IF;
  IF NOT partition_exists('bill_items_y2026m06') THEN
    CREATE TABLE bill_items_y2026m06 PARTITION OF bill_items
      FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
  END IF;
  IF NOT partition_exists('bill_items_y2026m07') THEN
    CREATE TABLE bill_items_y2026m07 PARTITION OF bill_items
      FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
  END IF;
  IF NOT partition_exists('bill_items_y2026m08') THEN
    CREATE TABLE bill_items_y2026m08 PARTITION OF bill_items
      FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
  END IF;
END $$;

CREATE INDEX idx_bill_items_bill        ON bill_items (bill_id, created_at DESC);
CREATE INDEX idx_bill_items_tenant      ON bill_items (tenant_id, created_at DESC);
CREATE INDEX idx_bill_items_ref         ON bill_items (ref_id) WHERE ref_id IS NOT NULL;

-- ============================================================================
-- 5. lab_order_items
-- ============================================================================
-- lab_order_items had no created_at column; we add it here.
-- Child tables with FKs INTO lab_order_items: none (leaf table).
DROP TABLE IF EXISTS lab_order_items CASCADE;

CREATE TABLE lab_order_items (
  id             uuid        NOT NULL,
  tenant_id      uuid        NOT NULL REFERENCES tenants(id),
  lab_order_id   uuid        NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  test_id        uuid        NOT NULL REFERENCES lab_tests_catalog(id),
  price_snapshot numeric     NOT NULL,
  result_value   numeric,
  result_text    text,
  unit           text,
  flag           text        NOT NULL DEFAULT 'pending'
                             CHECK (flag IN ('pending','normal','high','low')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

ALTER TABLE lab_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lab_items_tenant_all" ON lab_order_items FOR ALL
  USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
  WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');

DO $$ BEGIN
  IF NOT partition_exists('lab_order_items_y2026m04') THEN
    CREATE TABLE lab_order_items_y2026m04 PARTITION OF lab_order_items
      FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
  END IF;
  IF NOT partition_exists('lab_order_items_y2026m05') THEN
    CREATE TABLE lab_order_items_y2026m05 PARTITION OF lab_order_items
      FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
  END IF;
  IF NOT partition_exists('lab_order_items_y2026m06') THEN
    CREATE TABLE lab_order_items_y2026m06 PARTITION OF lab_order_items
      FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
  END IF;
  IF NOT partition_exists('lab_order_items_y2026m07') THEN
    CREATE TABLE lab_order_items_y2026m07 PARTITION OF lab_order_items
      FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
  END IF;
  IF NOT partition_exists('lab_order_items_y2026m08') THEN
    CREATE TABLE lab_order_items_y2026m08 PARTITION OF lab_order_items
      FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
  END IF;
END $$;

CREATE INDEX idx_lab_items_order   ON lab_order_items (lab_order_id, created_at DESC);
CREATE INDEX idx_lab_items_tenant  ON lab_order_items (tenant_id, created_at DESC);
CREATE INDEX idx_lab_items_test    ON lab_order_items (tenant_id, test_id, created_at DESC);

-- ============================================================================
-- pg_cron: auto-create next month's partitions on the 1st of each month
-- ============================================================================
CREATE OR REPLACE FUNCTION create_next_month_partitions()
RETURNS void
LANGUAGE plpgsql AS $$
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
  END IF;

  IF NOT partition_exists('appointments_' || suffix) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF appointments FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'appointments_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, scheduled_at)', 'appointments_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, doctor_id, scheduled_at)', 'appointments_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, patient_id, scheduled_at DESC)', 'appointments_' || suffix);
  END IF;

  IF NOT partition_exists('visits_' || suffix) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF visits FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'visits_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, visit_date DESC)', 'visits_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, patient_id, visit_date DESC)', 'visits_' || suffix);
  END IF;

  IF NOT partition_exists('bill_items_' || suffix) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF bill_items FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'bill_items_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (bill_id, created_at DESC)', 'bill_items_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, created_at DESC)', 'bill_items_' || suffix);
  END IF;

  IF NOT partition_exists('lab_order_items_' || suffix) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF lab_order_items FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'lab_order_items_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (lab_order_id, created_at DESC)', 'lab_order_items_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, created_at DESC)', 'lab_order_items_' || suffix);
  END IF;

  RAISE NOTICE 'Partitions ready for %', suffix;
END;
$$;

-- Run on the 1st of every month at 00:05 UTC
SELECT cron.schedule(
  'create-next-month-partitions',
  '5 0 1 * *',
  'SELECT create_next_month_partitions()'
);
