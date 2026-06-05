-- ============================================================
-- HMS Phase 3: Diagnostics & Dispensing
-- ============================================================

-- ===== Laboratory =====

CREATE TABLE IF NOT EXISTS lab_tests_catalog (
  id               uuid    PRIMARY KEY,
  name             text    NOT NULL,
  code             text    UNIQUE,
  sample_type      text,
  unit             text,
  ref_low          numeric,
  ref_high         numeric,
  reference_range  text,
  price            numeric NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS lab_orders (
  id             uuid        PRIMARY KEY,
  patient_id     uuid        NOT NULL REFERENCES patients(id),
  visit_id       uuid        REFERENCES visits(id),
  ordered_by     uuid        REFERENCES profiles(id),
  status         text        NOT NULL DEFAULT 'ordered'
                 CHECK (status IN ('ordered','collected','processing','reported','cancelled')),
  billing_status text        NOT NULL DEFAULT 'unbilled'
                 CHECK (billing_status IN ('unbilled','billed')),
  ordered_at     timestamptz DEFAULT now(),
  reported_at    timestamptz
);
CREATE INDEX IF NOT EXISTS lab_orders_patient_idx ON lab_orders (patient_id);
CREATE INDEX IF NOT EXISTS lab_orders_visit_idx   ON lab_orders (visit_id);
CREATE INDEX IF NOT EXISTS lab_orders_status_idx  ON lab_orders (status);

CREATE TABLE IF NOT EXISTS lab_order_items (
  id             uuid    PRIMARY KEY,
  lab_order_id   uuid    NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  test_id        uuid    NOT NULL REFERENCES lab_tests_catalog(id),
  price_snapshot numeric NOT NULL,
  result_value   numeric,
  result_text    text,
  unit           text,
  flag           text    DEFAULT 'pending'
                 CHECK (flag IN ('pending','normal','high','low'))
);
CREATE INDEX IF NOT EXISTS lab_items_order_idx ON lab_order_items (lab_order_id);

-- ===== Radiology =====

CREATE TABLE IF NOT EXISTS radiology_catalog (
  id        uuid    PRIMARY KEY,
  name      text    NOT NULL,
  modality  text,
  price     numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS radiology_orders (
  id             uuid        PRIMARY KEY,
  patient_id     uuid        NOT NULL REFERENCES patients(id),
  visit_id       uuid        REFERENCES visits(id),
  test_id        uuid        NOT NULL REFERENCES radiology_catalog(id),
  ordered_by     uuid        REFERENCES profiles(id),
  price_snapshot numeric     NOT NULL,
  status         text        NOT NULL DEFAULT 'ordered'
                 CHECK (status IN ('ordered','performed','reported','cancelled')),
  billing_status text        NOT NULL DEFAULT 'unbilled'
                 CHECK (billing_status IN ('unbilled','billed')),
  report         text,
  image_url      text,
  ordered_at     timestamptz DEFAULT now(),
  reported_at    timestamptz
);
CREATE INDEX IF NOT EXISTS radiology_patient_idx ON radiology_orders (patient_id);
CREATE INDEX IF NOT EXISTS radiology_visit_idx   ON radiology_orders (visit_id);
CREATE INDEX IF NOT EXISTS radiology_status_idx  ON radiology_orders (status);

-- ===== Pharmacy =====

CREATE TABLE IF NOT EXISTS drugs (
  id            uuid    PRIMARY KEY,
  name          text    NOT NULL,
  generic_name  text,
  form          text,
  strength      text,
  unit          text,
  reorder_level int     NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS drugs_name_idx ON drugs (name);

CREATE TABLE IF NOT EXISTS drug_batches (
  id             uuid    PRIMARY KEY,
  drug_id        uuid    NOT NULL REFERENCES drugs(id),
  batch_no       text    NOT NULL,
  expiry         date    NOT NULL,
  qty_available  int     NOT NULL DEFAULT 0,
  purchase_price numeric,
  mrp            numeric NOT NULL
);
CREATE INDEX IF NOT EXISTS batches_drug_expiry_idx ON drug_batches (drug_id, expiry);

CREATE TABLE IF NOT EXISTS dispenses (
  id              uuid        PRIMARY KEY,
  patient_id      uuid        NOT NULL REFERENCES patients(id),
  prescription_id uuid        REFERENCES prescriptions(id),
  drug_id         uuid        NOT NULL REFERENCES drugs(id),
  drug_batch_id   uuid        NOT NULL REFERENCES drug_batches(id),
  qty             int         NOT NULL CHECK (qty > 0),
  price_snapshot  numeric     NOT NULL,
  billing_status  text        NOT NULL DEFAULT 'unbilled'
                  CHECK (billing_status IN ('unbilled','billed')),
  dispensed_by    uuid        REFERENCES profiles(id),
  dispensed_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispenses_patient_idx      ON dispenses (patient_id);
CREATE INDEX IF NOT EXISTS dispenses_prescription_idx ON dispenses (prescription_id);

-- ============================================================
-- Concurrency-safe dispense: atomic decrement with expiry guard.
-- UPDATE WHERE qty_available >= qty ensures no oversell.
-- ============================================================
CREATE OR REPLACE FUNCTION dispense_drug(
  p_dispense_id      uuid,
  p_patient_id       uuid,
  p_prescription_id  uuid,
  p_drug_id          uuid,
  p_batch_id         uuid,
  p_qty              int,
  p_price_snapshot   numeric,
  p_dispensed_by     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE drug_batches
  SET qty_available = qty_available - p_qty
  WHERE id = p_batch_id
    AND qty_available >= p_qty
    AND expiry > CURRENT_DATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient stock or batch expired');
  END IF;

  INSERT INTO dispenses (id, patient_id, prescription_id, drug_id, drug_batch_id, qty,
                         price_snapshot, billing_status, dispensed_by)
  VALUES (p_dispense_id, p_patient_id, p_prescription_id, p_drug_id, p_batch_id, p_qty,
          p_price_snapshot, 'unbilled', p_dispensed_by);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION dispense_drug(uuid,uuid,uuid,uuid,uuid,int,numeric,uuid) TO authenticated;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE lab_tests_catalog  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE radiology_catalog  ENABLE ROW LEVEL SECURITY;
ALTER TABLE radiology_orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE drugs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE drug_batches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispenses          ENABLE ROW LEVEL SECURITY;

-- Lab catalog: all authenticated read; admin write
CREATE POLICY "lab_catalog_read"  ON lab_tests_catalog FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "lab_catalog_write" ON lab_tests_catalog FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true));

-- Lab orders: clinical read; doctor/admin order; lab_tech/admin process
CREATE POLICY "lab_orders_read" ON lab_orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse','lab_tech') AND p.is_active = true));
CREATE POLICY "lab_orders_insert" ON lab_orders FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor') AND p.is_active = true));
CREATE POLICY "lab_orders_update" ON lab_orders FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','lab_tech') AND p.is_active = true));

CREATE POLICY "lab_items_read" ON lab_order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse','lab_tech') AND p.is_active = true));
CREATE POLICY "lab_items_insert" ON lab_order_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor') AND p.is_active = true));
CREATE POLICY "lab_items_update" ON lab_order_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','lab_tech') AND p.is_active = true));

-- Radiology catalog: all read; admin write
CREATE POLICY "rad_catalog_read"  ON radiology_catalog FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rad_catalog_write" ON radiology_catalog FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true));

-- Radiology orders: clinical read; doctor order; lab_tech/admin process
CREATE POLICY "rad_orders_read" ON radiology_orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse','lab_tech') AND p.is_active = true));
CREATE POLICY "rad_orders_insert" ON radiology_orders FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor') AND p.is_active = true));
CREATE POLICY "rad_orders_update" ON radiology_orders FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','lab_tech') AND p.is_active = true));

-- Pharmacy: drugs/batches read all clinical; manage pharmacist/admin
CREATE POLICY "drugs_read"   ON drugs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "drugs_write"  ON drugs FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','pharmacist') AND p.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','pharmacist') AND p.is_active = true));
CREATE POLICY "batches_read"  ON drug_batches FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "batches_write" ON drug_batches FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','pharmacist') AND p.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','pharmacist') AND p.is_active = true));

CREATE POLICY "dispenses_read" ON dispenses FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','doctor','nurse','pharmacist') AND p.is_active = true));
CREATE POLICY "dispenses_insert" ON dispenses FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.role IN ('admin','pharmacist') AND p.is_active = true));

-- ============================================================
-- NOTE: Create 'radiology' Storage bucket in Supabase Dashboard:
--   Settings > Storage > New Bucket > name: radiology, Public: false
-- ============================================================
