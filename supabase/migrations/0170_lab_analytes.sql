-- A laboratory test stops being one number.
--
-- Today lab_order_items holds a single result_value per ordered test, so a CBC
-- — twenty-odd measurements — has one box. You can see the model straining in
-- any catalogue: "Complete Blood Count" carries unit g/dL and range 13–17,
-- which is haemoglobin's, because one analyte had to stand in for the panel.
-- An analyzer reporting 22 parameters has nowhere to put 21 of them.
--
-- Built to NABL 112 (ISO 15189):
--   §5.7  published reference intervals are acceptable provided the laboratory
--         evaluates them and RETAINS THE DOCUMENTATION — hence source_note,
--         which is that documentation, not bookkeeping.
--   §5.8  critical limits shall be established, displayed, and communicated to
--         the clinician "after proper documentation" — hence the notification
--         table, because a red flag alone does not satisfy the clause.
--
-- Nothing here removes anything. lab_order_items keeps its result_value as the
-- panel-level summary, so every existing screen, report and export keeps
-- working while the analyte layer is built on top.

-- ── The dictionary: what can be measured ────────────────────────────────────

CREATE TABLE IF NOT EXISTS lab_analytes (
  id            uuid PRIMARY KEY,
  code          text NOT NULL,           -- our short code, e.g. 'HGB'
  loinc_code    text,                    -- optional; populated centrally, never shown to a tenant
  name          text NOT NULL,           -- 'Haemoglobin'
  short_name    text,                    -- what fits on a report line
  unit_ucum     text,                    -- 'g/dL' — one spelling, so two analyzers cannot disagree
  decimals      int NOT NULL DEFAULT 1,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lab_analytes_code_key UNIQUE (code)
);

COMMENT ON TABLE lab_analytes IS
  'Global dictionary of measurable analytes. Not tenant-scoped — a haemoglobin is a haemoglobin.';

-- Which analytes make up a panel. Global, alongside lab_tests_master.
CREATE TABLE IF NOT EXISTS lab_test_analytes (
  id             uuid PRIMARY KEY,
  lab_master_id  uuid NOT NULL REFERENCES lab_tests_master(id) ON DELETE CASCADE,
  analyte_id     uuid NOT NULL REFERENCES lab_analytes(id) ON DELETE CASCADE,
  display_order  int NOT NULL DEFAULT 0,
  CONSTRAINT lab_test_analytes_key UNIQUE (lab_master_id, analyte_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_test_analytes_master
  ON lab_test_analytes (lab_master_id, display_order);

-- ── Reference and critical ranges ───────────────────────────────────────────
--
-- tenant_id NULL is the Uyirly standard, shipped with every tenant. A row with
-- a tenant_id is that hospital's own decision and always wins. We never
-- overwrite a range a hospital has set — see 0171 for the migration of the
-- ranges they have already typed.

CREATE TABLE IF NOT EXISTS lab_reference_ranges (
  id            uuid PRIMARY KEY,
  tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,   -- NULL = our standard
  analyte_id    uuid NOT NULL REFERENCES lab_analytes(id) ON DELETE CASCADE,
  sex           text NOT NULL DEFAULT 'any',
  -- Age in DAYS, because a newborn's range changes within the first week and
  -- years cannot express that.
  age_min_days  int NOT NULL DEFAULT 0,
  age_max_days  int NOT NULL DEFAULT 54750,                      -- ~150 years
  ref_low       numeric,
  ref_high      numeric,
  crit_low      numeric,   -- NABL §5.8: below this, telephone somebody
  crit_high     numeric,
  source        text NOT NULL DEFAULT 'uyirly_standard',
  source_note   text,      -- the citation. This is the retained evaluation.
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lab_ref_sex_check CHECK (sex = ANY (ARRAY['any','male','female'])),
  CONSTRAINT lab_ref_source_check CHECK (source = ANY (ARRAY['uyirly_standard','tenant'])),
  CONSTRAINT lab_ref_age_check CHECK (age_max_days >= age_min_days)
);

CREATE INDEX IF NOT EXISTS idx_lab_ref_lookup
  ON lab_reference_ranges (analyte_id, sex, age_min_days, age_max_days);
CREATE INDEX IF NOT EXISTS idx_lab_ref_tenant
  ON lab_reference_ranges (tenant_id) WHERE tenant_id IS NOT NULL;

/**
 * The range that applies to one patient, most specific first:
 *   a tenant's own row beats our standard
 *   a sex-specific row beats 'any'
 *   a narrower age band beats a wider one
 *
 * This ordering is where the whole feature goes quietly wrong — a woman landing
 * on the adult 'any' band when a female band exists, or a four-day-old on the
 * paediatric band when a newborn band exists — so it lives in one place.
 */
CREATE OR REPLACE FUNCTION resolve_reference_range(
  p_analyte  uuid,
  p_tenant   uuid,
  p_sex      text,
  p_age_days int
) RETURNS lab_reference_ranges
LANGUAGE sql STABLE AS $$
  SELECT r.*
    FROM lab_reference_ranges r
   WHERE r.analyte_id = p_analyte
     AND (r.tenant_id IS NULL OR r.tenant_id = p_tenant)
     AND (r.sex = 'any' OR r.sex = COALESCE(p_sex, 'any'))
     AND COALESCE(p_age_days, 0) BETWEEN r.age_min_days AND r.age_max_days
   ORDER BY (r.tenant_id IS NOT NULL) DESC,
            (r.sex <> 'any') DESC,
            (r.age_max_days - r.age_min_days) ASC
   LIMIT 1
$$;

-- ── The results ─────────────────────────────────────────────────────────────
--
-- Hung off lab_orders rather than lab_order_items: lab_order_items is
-- range-partitioned with PK (id, created_at), so a child FK would have to carry
-- the partition key around. lab_orders.id is a plain primary key, and
-- (lab_order_id, test_id, analyte_id) identifies the same thing.

CREATE TABLE IF NOT EXISTS lab_result_analytes (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  lab_order_id  uuid NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  test_id       uuid NOT NULL REFERENCES lab_tests_catalog(id) ON DELETE CASCADE,
  analyte_id    uuid NOT NULL REFERENCES lab_analytes(id),
  value_num     numeric,
  value_text    text,
  unit_ucum     text,
  -- The range that was APPLIED, copied here at write time. A report reprinted
  -- in two years must show the band actually used, not today's catalogue.
  ref_low       numeric,
  ref_high      numeric,
  crit_low      numeric,
  crit_high     numeric,
  flag          text NOT NULL DEFAULT 'pending',
  source        text NOT NULL DEFAULT 'manual',
  analyzer_id   uuid,           -- FK added when the analyzer tables land
  entered_by    uuid REFERENCES profiles(id),
  PRIMARY KEY (id, created_at),
  CONSTRAINT lab_result_flag_check CHECK (flag = ANY (ARRAY[
    'pending','normal','high','low','critical_high','critical_low','abnormal'
  ])),
  CONSTRAINT lab_result_source_check CHECK (source = ANY (ARRAY['manual','analyzer']))
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_lab_result_analytes_order
  ON lab_result_analytes (lab_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_result_analytes_tenant
  ON lab_result_analytes (tenant_id, created_at DESC);
-- Delta checking reads a patient's previous value for one analyte.
CREATE INDEX IF NOT EXISTS idx_lab_result_analytes_delta
  ON lab_result_analytes (tenant_id, analyte_id, created_at DESC);

-- One row per analyte per ordered test.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_result_analytes_unique
  ON lab_result_analytes (lab_order_id, test_id, analyte_id, created_at);

-- ── Critical value notifications (NABL §5.8) ────────────────────────────────

CREATE TABLE IF NOT EXISTS lab_critical_notifications (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lab_order_id   uuid NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  analyte_id     uuid NOT NULL REFERENCES lab_analytes(id),
  value_num      numeric,
  notified_to    uuid REFERENCES profiles(id),   -- the clinician told
  notified_to_name text,                         -- or a free-text name, for a referring doctor
  notified_by    uuid REFERENCES profiles(id),   -- who made the call
  notified_at    timestamptz,
  method         text,                           -- 'phone' | 'in_person' | 'message'
  acknowledged   boolean NOT NULL DEFAULT false,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_crit_open
  ON lab_critical_notifications (tenant_id, acknowledged, created_at DESC);

-- ── Partitions ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  m date := date_trunc('month', now() - interval '9 months')::date;
  suffix text;
BEGIN
  WHILE m < date_trunc('month', now() + interval '4 months')::date LOOP
    suffix := 'lab_result_analytes_' || to_char(m, '"y"YYYY"m"MM');
    IF NOT partition_exists(suffix) THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF lab_result_analytes FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
        suffix, m, (m + interval '1 month')::date);
      EXECUTE format('CREATE INDEX ON %I (lab_order_id, created_at DESC)', suffix);
      EXECUTE format('CREATE INDEX ON %I (tenant_id, created_at DESC)', suffix);
      PERFORM secure_partition(suffix);
    END IF;
    m := (m + interval '1 month')::date;
  END LOOP;
END $$;

-- Keep the monthly cron making them, and the daily alarm watching for a gap.
CREATE OR REPLACE FUNCTION create_next_month_partitions() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p_start date := date_trunc('month', now() + interval '1 month')::date;
  p_end   date := (p_start + interval '1 month')::date;
  suffix  text := to_char(p_start, '"y"YYYY"m"MM');
BEGIN
  IF NOT partition_exists('audit_logs_' || suffix) THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'audit_logs_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, created_at DESC)', 'audit_logs_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, entity, entity_id, created_at DESC)', 'audit_logs_' || suffix);
    PERFORM secure_partition('audit_logs_' || suffix);
  END IF;

  IF NOT partition_exists('appointments_' || suffix) THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF appointments FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'appointments_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, scheduled_at)', 'appointments_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, doctor_id, scheduled_at)', 'appointments_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, patient_id, scheduled_at DESC)', 'appointments_' || suffix);
    PERFORM secure_partition('appointments_' || suffix);
  END IF;

  IF NOT partition_exists('visits_' || suffix) THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF visits FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'visits_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, visit_date DESC)', 'visits_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, patient_id, visit_date DESC)', 'visits_' || suffix);
    PERFORM secure_partition('visits_' || suffix);
  END IF;

  IF NOT partition_exists('bill_items_' || suffix) THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF bill_items FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'bill_items_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (bill_id, created_at DESC)', 'bill_items_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, created_at DESC)', 'bill_items_' || suffix);
    PERFORM secure_partition('bill_items_' || suffix);
  END IF;

  IF NOT partition_exists('lab_order_items_' || suffix) THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF lab_order_items FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'lab_order_items_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (lab_order_id, created_at DESC)', 'lab_order_items_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, created_at DESC)', 'lab_order_items_' || suffix);
    PERFORM secure_partition('lab_order_items_' || suffix);
  END IF;

  IF NOT partition_exists('lab_result_analytes_' || suffix) THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF lab_result_analytes FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
      'lab_result_analytes_' || suffix, p_start, p_end);
    EXECUTE format('CREATE INDEX ON %I (lab_order_id, created_at DESC)', 'lab_result_analytes_' || suffix);
    EXECUTE format('CREATE INDEX ON %I (tenant_id, created_at DESC)', 'lab_result_analytes_' || suffix);
    PERFORM secure_partition('lab_result_analytes_' || suffix);
  END IF;

  RAISE NOTICE 'Partitions ready for %', suffix;
END $$;

CREATE OR REPLACE FUNCTION alert_missing_next_partition() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  next_suffix text := to_char(date_trunc('month', now() + interval '1 month'), '"y"YYYY"m"MM');
  tables text[] := ARRAY[
    'audit_logs', 'visits', 'appointments', 'bill_items', 'lab_order_items', 'lab_result_analytes'
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
END $$;

-- ── Row level security ──────────────────────────────────────────────────────

ALTER TABLE lab_analytes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_test_analytes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_reference_ranges ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_result_analytes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_critical_notifications ENABLE ROW LEVEL SECURITY;

-- The dictionary is shared, like lab_tests_master: everyone reads, nobody writes.
DROP POLICY IF EXISTS lab_analytes_read ON lab_analytes;
CREATE POLICY lab_analytes_read ON lab_analytes FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS lab_test_analytes_read ON lab_test_analytes;
CREATE POLICY lab_test_analytes_read ON lab_test_analytes FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

-- Ranges: read ours and your own; write only your own.
DROP POLICY IF EXISTS lab_ref_read ON lab_reference_ranges;
CREATE POLICY lab_ref_read ON lab_reference_ranges FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated'
     AND (tenant_id IS NULL OR tenant_id = (SELECT current_tenant_id())));

DROP POLICY IF EXISTS lab_ref_write ON lab_reference_ranges;
CREATE POLICY lab_ref_write ON lab_reference_ranges FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS lab_result_analytes_tenant_all ON lab_result_analytes;
CREATE POLICY lab_result_analytes_tenant_all ON lab_result_analytes FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS lab_crit_tenant_all ON lab_critical_notifications;
CREATE POLICY lab_crit_tenant_all ON lab_critical_notifications FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');
