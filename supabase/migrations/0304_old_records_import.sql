-- Room for a hospital's history from its previous software ───────────────────
--
-- KMCH ran SwiftEHR from Nov 2024 to Nov 2026. Its history goes into the real
-- Uyirly tables (patients, appointments, visits, admissions, lab, bills), not a
-- separate "old records" store. Three things stand in the way:
--
-- 1. Six tables are split by month and only reach back to April 2026
--    (lab_result_analytes to December 2025). A row dated earlier has no month
--    to land in and the insert fails. The old records start in January 2025.
--    December 2024 is included because a 1 January visit before 05:30 IST is
--    still 31 December in UTC, which is how the months are cut.
--    audit_logs is left alone: nothing old is written to it.
--
-- 2. Patients get a new Uyirly UHID and admissions a new IP number, but the
--    hospital's paper files, old cards and receipts carry the old ones
--    (DRKMCH-123, FAC-18-45). Each gets a column so it stays visible and the
--    patient can still be found by it. NULL for everyone registered in Uyirly.
--
-- 3. An import has to be undoable. import_log records every row an import
--    wrote, keyed by what it was in the old system, so a step can be re-run
--    without duplicating and removed without touching anything else.

-- ── 1. Months back to December 2024 ─────────────────────────────────────────
-- ensure_partition_for skips a month that already exists and secures the new
-- one (RLS on, API roles revoked) the same way the monthly job does.
DO $$
DECLARE
  t text;
  m date;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments', 'visits', 'bill_items',
                           'lab_order_items', 'lab_result_analytes'] LOOP
    m := DATE '2024-12-01';
    WHILE m < DATE '2026-04-01' LOOP
      PERFORM ensure_partition_for(t, m);
      m := (m + interval '1 month')::date;
    END LOOP;
  END LOOP;
END $$;

DO $$
DECLARE
  t text;
  m date;
  missing text := '';
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments', 'visits', 'bill_items',
                           'lab_order_items', 'lab_result_analytes'] LOOP
    m := DATE '2024-12-01';
    WHILE m < DATE '2026-04-01' LOOP
      IF NOT partition_exists(t || '_' || to_char(m, '"y"YYYY"m"MM')) THEN
        missing := missing || ' ' || t || '_' || to_char(m, '"y"YYYY"m"MM');
      END IF;
      m := (m + interval '1 month')::date;
    END LOOP;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION 'Months still missing:%', missing;
  END IF;
END $$;

-- ── 2. The old numbers ──────────────────────────────────────────────────────
ALTER TABLE patients   ADD COLUMN IF NOT EXISTS legacy_uhid  text;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS legacy_ip_no text;

COMMENT ON COLUMN patients.legacy_uhid IS
  'The patient''s number in the hospital''s previous software (e.g. DRKMCH-123). Searchable. NULL for patients registered in Uyirly.';
COMMENT ON COLUMN admissions.legacy_ip_no IS
  'The admission''s IP number in the hospital''s previous software (e.g. FAC-18-45). NULL for admissions made in Uyirly.';

-- One old number is one patient / one stay inside a hospital.
CREATE UNIQUE INDEX IF NOT EXISTS patients_tenant_legacy_uhid_key
  ON patients (tenant_id, legacy_uhid) WHERE legacy_uhid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS admissions_tenant_legacy_ip_no_key
  ON admissions (tenant_id, legacy_ip_no) WHERE legacy_ip_no IS NOT NULL;

-- ── 3. What an import wrote ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_log (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source     text NOT NULL,   -- the old system, e.g. 'swiftehr'
  table_name text NOT NULL,   -- the Uyirly table the row went into
  source_key text NOT NULL,   -- what the row was in the old system, e.g. 'visit:59870'
  row_id     uuid NOT NULL,   -- the Uyirly row
  step       text NOT NULL,   -- 'patients', 'visits', … so one step can be undone alone
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, source, table_name, source_key)
);
CREATE INDEX IF NOT EXISTS import_log_step_idx ON import_log (tenant_id, source, step);

COMMENT ON TABLE import_log IS
  'Every row a history import wrote, so it can be re-run without duplicates and undone. Written only by the import script (service role).';

-- Only the import script (service role) touches it.
ALTER TABLE import_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON import_log FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
