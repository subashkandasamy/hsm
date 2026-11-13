-- Test packages: several tests sold together at one price.
--
-- A hospital's health check-up is not one test. KMCH's "Basic Health Check-Up"
-- (₹5,000) is CBC, blood group, sugar, HbA1c, RFT, lipid profile, LFT,
-- electrolytes, urine routine — and an ECG, which this hospital keeps in its
-- Radiology list. Their "Regular" check-up adds CA-125 for women and PSA for
-- men. Until now the only way to sell one was a made-up single test called
-- "Health Check-Up – Basic", which ordered nothing: no tubes, no result lines,
-- no ECG — one empty box on a ₹5,000 bill.
--
-- A package here is only a recipe. Ordering it creates ordinary orders — one
-- lab order holding every lab test, and one radiology order per scan — so
-- sample collection, result entry, analyzers, verification, reports, the
-- patient portal and the "pay before sample" gate all work unchanged.
--
-- Money: the package price is shared out across its tests in proportion to
-- their own prices (done in the application, src/lib/lab/packagePrice.ts), and
-- each test's share is its price_snapshot. Each bill line therefore stays in
-- its own department, so GST, collection accounts, department revenue and the
-- refund when one order is cancelled all keep working without a special case.
-- This function refuses shares that do not add up to the package price.

BEGIN;

-- ── The recipe ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS test_packages (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) > 0),
  price       numeric(12,2) NOT NULL CHECK (price > 0),
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE test_packages IS
  'Several lab tests and/or scans sold together at one price (e.g. a health check-up). Ordering one creates ordinary lab and radiology orders.';

-- Two packages with the same name would be two rows nobody can tell apart on
-- an order screen.
CREATE UNIQUE INDEX IF NOT EXISTS test_packages_name_key
  ON test_packages (tenant_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS test_package_items (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id         uuid NOT NULL REFERENCES test_packages(id) ON DELETE CASCADE,
  lab_test_id        uuid REFERENCES lab_tests_catalog(id),
  radiology_test_id  uuid REFERENCES radiology_catalog(id),
  -- CA-125 is for women and PSA for men; a check-up holding both gives each
  -- patient only theirs.
  applies_to         text NOT NULL DEFAULT 'all',
  display_order      int  NOT NULL DEFAULT 0,
  CONSTRAINT test_package_items_one_kind CHECK ((lab_test_id IS NULL) <> (radiology_test_id IS NULL)),
  CONSTRAINT test_package_items_applies_to CHECK (applies_to = ANY (ARRAY['all','female','male']))
);
CREATE UNIQUE INDEX IF NOT EXISTS test_package_items_lab_key
  ON test_package_items (package_id, lab_test_id) WHERE lab_test_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS test_package_items_rad_key
  ON test_package_items (package_id, radiology_test_id) WHERE radiology_test_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS test_package_items_package
  ON test_package_items (package_id, display_order);

-- ── What was ordered ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS package_orders (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id      uuid NOT NULL REFERENCES test_packages(id),
  patient_id      uuid NOT NULL REFERENCES patients(id),
  -- No foreign key: visits is partitioned (0011), so nothing can reference it
  -- by id alone — the same as every table written since.
  visit_id        uuid,
  admission_id    uuid REFERENCES admissions(id),
  -- As sold: renaming or repricing the package later must not rewrite history.
  name_snapshot   text NOT NULL,
  price_snapshot  numeric(12,2) NOT NULL,
  status          text NOT NULL DEFAULT 'ordered',
  ordered_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ordered_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT package_orders_status CHECK (status = ANY (ARRAY['ordered','cancelled']))
);
CREATE INDEX IF NOT EXISTS package_orders_patient ON package_orders (tenant_id, patient_id, ordered_at DESC);

ALTER TABLE lab_orders       ADD COLUMN IF NOT EXISTS package_order_id uuid REFERENCES package_orders(id);
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS package_order_id uuid REFERENCES package_orders(id);
CREATE INDEX IF NOT EXISTS lab_orders_package_order       ON lab_orders (package_order_id) WHERE package_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS radiology_orders_package_order ON radiology_orders (package_order_id) WHERE package_order_id IS NOT NULL;

-- ── Who can see and change them: one hospital, signed-in staff ──────────────
-- (Which staff may manage or order is checked in the application by role, as
-- for the lab catalogue itself.)

ALTER TABLE test_packages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_orders     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON test_packages, test_package_items, package_orders FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON test_packages, test_package_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON package_orders TO authenticated;

DROP POLICY IF EXISTS test_packages_tenant ON test_packages;
CREATE POLICY test_packages_tenant ON test_packages FOR ALL
  USING      (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS test_package_items_tenant ON test_package_items;
CREATE POLICY test_package_items_tenant ON test_package_items FOR ALL
  USING      (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS package_orders_tenant ON package_orders;
CREATE POLICY package_orders_tenant ON package_orders FOR ALL
  USING      (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

-- ── Ordering one: every row or none ─────────────────────────────────────────
--
-- p_lab / p_radiology: [{"test_id": uuid, "price": number}, …] — the tests this
-- patient gets (already filtered by sex) with each one's share of the price.
-- INVOKER: the caller's own row-level security applies to every insert.

CREATE OR REPLACE FUNCTION public.create_package_order(
  p_package_id    uuid,
  p_patient_id    uuid,
  p_visit_id      uuid,
  p_admission_id  uuid,
  p_priority      text,
  p_scheduled_for date,
  p_lab           jsonb,
  p_radiology     jsonb,
  p_price         numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant    uuid := current_tenant_id();
  v_actor     uuid := auth.uid();
  v_pkg       record;
  v_po_id     uuid := gen_random_uuid();
  v_lab_id    uuid;
  v_rad_ids   uuid[] := ARRAY[]::uuid[];
  v_rad_id    uuid;
  v_sum       numeric := 0;
  v_bad       int;
  r           record;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hospital context for this request');
  END IF;

  SELECT id, name, price, is_active INTO v_pkg
    FROM test_packages WHERE id = p_package_id AND tenant_id = v_tenant;
  IF v_pkg.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That package is not in your list');
  END IF;
  IF NOT v_pkg.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That package is switched off');
  END IF;
  IF round(p_price, 2) <> round(v_pkg.price, 2) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The package price has changed — refresh and try again');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM patients WHERE id = p_patient_id AND tenant_id = v_tenant) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Patient not found');
  END IF;

  IF jsonb_array_length(COALESCE(p_lab, '[]'::jsonb)) + jsonb_array_length(COALESCE(p_radiology, '[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nothing in this package applies to this patient');
  END IF;

  -- Every test must belong to this package and still be on sale.
  SELECT count(*) INTO v_bad
    FROM jsonb_to_recordset(COALESCE(p_lab, '[]'::jsonb)) AS x(test_id uuid, price numeric)
   WHERE NOT EXISTS (
           SELECT 1 FROM test_package_items i
             JOIN lab_tests_catalog c ON c.id = i.lab_test_id
            WHERE i.package_id = p_package_id AND i.lab_test_id = x.test_id
              AND c.tenant_id = v_tenant AND c.is_active AND NOT c.package_only)
      OR x.price IS NULL OR x.price < 0;
  IF v_bad > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A test in this package is no longer offered — edit the package first');
  END IF;

  SELECT count(*) INTO v_bad
    FROM jsonb_to_recordset(COALESCE(p_radiology, '[]'::jsonb)) AS x(test_id uuid, price numeric)
   WHERE NOT EXISTS (
           SELECT 1 FROM test_package_items i
             JOIN radiology_catalog c ON c.id = i.radiology_test_id
            WHERE i.package_id = p_package_id AND i.radiology_test_id = x.test_id
              AND c.tenant_id = v_tenant AND c.is_active)
      OR x.price IS NULL OR x.price < 0;
  IF v_bad > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A scan in this package is no longer offered — edit the package first');
  END IF;

  SELECT COALESCE(sum(x.price), 0) INTO v_sum FROM (
    SELECT price FROM jsonb_to_recordset(COALESCE(p_lab, '[]'::jsonb)) AS a(test_id uuid, price numeric)
    UNION ALL
    SELECT price FROM jsonb_to_recordset(COALESCE(p_radiology, '[]'::jsonb)) AS b(test_id uuid, price numeric)
  ) x;
  IF abs(v_sum - v_pkg.price) > 0.005 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The shares do not add up to the package price');
  END IF;

  INSERT INTO package_orders (id, tenant_id, package_id, patient_id, visit_id, admission_id,
                              name_snapshot, price_snapshot, status, ordered_by)
  VALUES (v_po_id, v_tenant, p_package_id, p_patient_id, p_visit_id, p_admission_id,
          v_pkg.name, v_pkg.price, 'ordered', v_actor);

  IF jsonb_array_length(COALESCE(p_lab, '[]'::jsonb)) > 0 THEN
    v_lab_id := gen_random_uuid();
    INSERT INTO lab_orders (id, tenant_id, patient_id, visit_id, admission_id, ordered_by,
                            status, billing_status, priority, scheduled_for, package_order_id)
    VALUES (v_lab_id, v_tenant, p_patient_id, p_visit_id, p_admission_id, v_actor,
            'ordered', 'unbilled', COALESCE(p_priority, 'routine'), p_scheduled_for, v_po_id);

    INSERT INTO lab_order_items (id, tenant_id, lab_order_id, test_id, price_snapshot, flag)
    SELECT gen_random_uuid(), v_tenant, v_lab_id, x.test_id, round(x.price, 2), 'pending'
      FROM jsonb_to_recordset(p_lab) AS x(test_id uuid, price numeric);
  END IF;

  FOR r IN SELECT * FROM jsonb_to_recordset(COALESCE(p_radiology, '[]'::jsonb)) AS x(test_id uuid, price numeric) LOOP
    v_rad_id := gen_random_uuid();
    INSERT INTO radiology_orders (id, tenant_id, patient_id, visit_id, admission_id, test_id, ordered_by,
                                  price_snapshot, status, billing_status, priority, scheduled_for, package_order_id)
    VALUES (v_rad_id, v_tenant, p_patient_id, p_visit_id, p_admission_id, r.test_id, v_actor,
            round(r.price, 2), 'ordered', 'unbilled', COALESCE(p_priority, 'routine'), p_scheduled_for, v_po_id);
    v_rad_ids := v_rad_ids || v_rad_id;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'package_order_id', v_po_id,
                            'lab_order_id', v_lab_id, 'radiology_order_ids', to_jsonb(v_rad_ids));
END;
$function$;

REVOKE ALL ON FUNCTION public.create_package_order(uuid, uuid, uuid, uuid, text, date, jsonb, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_package_order(uuid, uuid, uuid, uuid, text, date, jsonb, jsonb, numeric) TO authenticated, service_role;

COMMIT;
