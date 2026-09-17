-- Obstetrics & Gynaecology OPD template ────────────────────────────────────────

-- Pregnancy record: living children, previous caesareans, ultrasound dating and
-- risk factors. edd keeps the EDD in use; edd_basis says where it came from.
ALTER TABLE anc_records ADD COLUMN IF NOT EXISTS living              INTEGER CHECK (living >= 0);
ALTER TABLE anc_records ADD COLUMN IF NOT EXISTS previous_caesareans INTEGER CHECK (previous_caesareans >= 0);
ALTER TABLE anc_records ADD COLUMN IF NOT EXISTS scan_date           DATE;
ALTER TABLE anc_records ADD COLUMN IF NOT EXISTS scan_ga_days        INTEGER CHECK (scan_ga_days BETWEEN 35 AND 300);
ALTER TABLE anc_records ADD COLUMN IF NOT EXISTS edd_basis           TEXT CHECK (edd_basis IN ('lmp', 'scan'));
ALTER TABLE anc_records ADD COLUMN IF NOT EXISTS risk_factors        TEXT[] NOT NULL DEFAULT '{}';

-- One ongoing pregnancy per patient.
CREATE UNIQUE INDEX IF NOT EXISTS anc_records_one_active ON anc_records (patient_id) WHERE status = 'active';

-- An antenatal check done in an OPD consultation belongs to that visit (one row
-- per visit; re-saving updates it). visits is partitioned, so no FK.
ALTER TABLE anc_visits ADD COLUMN IF NOT EXISTS visit_id     UUID;
ALTER TABLE anc_visits ADD COLUMN IF NOT EXISTS oedema       TEXT;
ALTER TABLE anc_visits ADD COLUMN IF NOT EXISTS presentation TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS anc_visits_visit_key ON anc_visits (visit_id) WHERE visit_id IS NOT NULL;

-- Antenatal care schedule items done (tests, scans, Td doses, supplements).
CREATE TABLE IF NOT EXISTS anc_care_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  anc_id      UUID NOT NULL REFERENCES anc_records(id) ON DELETE CASCADE,
  item_key    TEXT NOT NULL,
  done_on     DATE NOT NULL,
  result      TEXT,
  recorded_by UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anc_id, item_key)
);
ALTER TABLE anc_care_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY anc_care_items_tenant_all ON anc_care_items FOR ALL
    USING (tenant_id = current_tenant_id() AND auth.role() = 'authenticated')
    WITH CHECK (tenant_id = current_tenant_id() AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
REVOKE ALL ON anc_care_items FROM anon;

NOTIFY pgrst, 'reload schema';
