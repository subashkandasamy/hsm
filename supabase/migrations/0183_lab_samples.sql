-- The tube becomes a record.
--
-- Today a tube exists only while a label is printing: the sample-label route
-- groups an order's tests by sample_type into a Map and numbers them by
-- iteration order. Nothing is stored. Three consequences, all real:
--
--   * Reprinting after a test is added can renumber tubes already stuck to
--     glass, because lab_order_items has no ordering column and the Map order
--     is not stable.
--   * An analyzer reporting against barcode 2609230004-01 can be resolved to
--     the order but not to the tests physically on that tube.
--   * 287 master tests say sample_type 'blood', so a CBC and an LFT on one
--     order became ONE tube. They are not one tube. A CBC needs lavender EDTA
--     and an LFT needs red serum, and putting them together gives neither.
--
-- ── Tube type, and why sample_type was not enough ──────────────────────────
--
-- sample_type says what came out of the patient. tube_type says what it went
-- into, which is what decides how many labels print, in what order they are
-- drawn, and which tests share a tube. Defaults are assigned by category below
-- and a hospital can change any of them — this is a starting point, not a
-- claim about every laboratory's protocol.

ALTER TABLE lab_tests_master ADD COLUMN IF NOT EXISTS tube_type text;
ALTER TABLE lab_tests_catalog ADD COLUMN IF NOT EXISTS tube_type text;

COMMENT ON COLUMN lab_tests_master.tube_type IS
  'Which container this test is drawn into. Decides how many tubes an order needs and the order they are drawn in — see lab_tube_types.';

-- The draw order is NABL 112 Annexure III, whose purpose is to stop additive
-- from one tube contaminating the next. Getting it wrong produces wrong
-- results, not just untidy labels.
CREATE TABLE IF NOT EXISTS lab_tube_types (
  code        text PRIMARY KEY,
  label       text NOT NULL,
  closure     text,          -- the cap colour a phlebotomist actually looks for
  draw_order  int NOT NULL,  -- 1 first
  is_blood    boolean NOT NULL DEFAULT true
);

INSERT INTO lab_tube_types (code, label, closure, draw_order, is_blood) VALUES
  ('culture',  'Blood culture bottle',      NULL,       1, true),
  ('citrate',  'Citrate (coagulation)',     'Blue',     2, true),
  ('serum',    'Serum / clot activator',    'Red',      3, true),
  ('heparin',  'Heparin',                   'Green',    4, true),
  ('edta',     'EDTA',                      'Lavender', 5, true),
  ('fluoride', 'Fluoride (glycolysis inhibitor)', 'Grey', 6, true),
  ('urine',    'Urine container',           NULL,      10, false),
  ('stool',    'Stool container',           NULL,      11, false),
  ('sputum',   'Sputum container',          NULL,      12, false),
  ('swab',     'Swab',                      NULL,      13, false),
  ('csf',      'CSF vial',                  NULL,      14, false),
  ('tissue',   'Tissue / biopsy pot',       NULL,      15, false),
  ('other',    'Other container',           NULL,      20, false)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE lab_tube_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_tube_types_read ON lab_tube_types;
CREATE POLICY lab_tube_types_read ON lab_tube_types FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

-- Casing drifted: three rows say 'Blood' and 287 say 'blood'.
UPDATE lab_tests_master SET sample_type = lower(trim(sample_type))
 WHERE sample_type IS NOT NULL AND sample_type <> lower(trim(sample_type));

-- Defaults by category. Haematology runs on EDTA, coagulation on citrate,
-- glucose on fluoride because the additive is what stops the cells eating the
-- sugar before it is measured; the rest of blood chemistry is serum.
UPDATE lab_tests_master SET tube_type =
  CASE
    WHEN lower(coalesce(sample_type, '')) = 'urine'  THEN 'urine'
    WHEN lower(coalesce(sample_type, '')) = 'stool'  THEN 'stool'
    WHEN lower(coalesce(sample_type, '')) = 'sputum' THEN 'sputum'
    WHEN lower(coalesce(sample_type, '')) = 'swab'   THEN 'swab'
    WHEN lower(coalesce(sample_type, '')) = 'csf'    THEN 'csf'
    WHEN lower(coalesce(sample_type, '')) = 'tissue' THEN 'tissue'
    WHEN name ~* 'blood culture'                     THEN 'culture'
    WHEN category = 'Coagulation Profile'            THEN 'citrate'
    WHEN category = 'Haematology'                    THEN 'edta'
    WHEN name ~* '^(HbA1c|Glycated)'                 THEN 'edta'
    WHEN name ~* '(Glucose|Blood Sugar)'             THEN 'fluoride'
    WHEN lower(coalesce(sample_type, '')) = 'blood'  THEN 'serum'
    ELSE 'other'
  END
 WHERE tube_type IS NULL;

-- Carry it onto whatever hospitals have already activated.
UPDATE lab_tests_catalog c SET tube_type = m.tube_type
  FROM lab_tests_master m
 WHERE c.lab_master_id = m.id AND c.tube_type IS NULL;
UPDATE lab_tests_catalog SET tube_type = 'other' WHERE tube_type IS NULL;

-- ── The samples themselves ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lab_samples (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lab_order_id  uuid NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  tube_no       int NOT NULL,
  tube_type     text NOT NULL REFERENCES lab_tube_types(code),
  -- The accession plus the tube number, stored rather than recomputed. This is
  -- what is printed on the label and what an analyzer sends back.
  barcode       text NOT NULL,
  collected_at  timestamptz,
  collected_by  uuid REFERENCES profiles(id),
  received_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lab_samples_barcode_key UNIQUE (tenant_id, barcode),
  CONSTRAINT lab_samples_tube_key UNIQUE (lab_order_id, tube_no)
);

CREATE INDEX IF NOT EXISTS idx_lab_samples_order ON lab_samples (lab_order_id, tube_no);

-- Which tests are on which tube. The question an analyzer's sample id asks.
CREATE TABLE IF NOT EXISTS lab_sample_items (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sample_id          uuid NOT NULL REFERENCES lab_samples(id) ON DELETE CASCADE,
  test_id            uuid NOT NULL REFERENCES lab_tests_catalog(id) ON DELETE CASCADE,
  CONSTRAINT lab_sample_items_key UNIQUE (sample_id, test_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_sample_items_test ON lab_sample_items (test_id);

ALTER TABLE lab_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_sample_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lab_samples_tenant_all ON lab_samples;
CREATE POLICY lab_samples_tenant_all ON lab_samples FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS lab_sample_items_tenant_all ON lab_sample_items;
CREATE POLICY lab_sample_items_tenant_all ON lab_sample_items FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

/**
 * Work out the tubes an order needs, and write them down.
 *
 * One tube per tube type, numbered in NABL's draw order so tube 01 really is
 * the one to draw first. Idempotent — safe to call again when a test is added
 * to an order, and it will never renumber a tube that already exists, because
 * that tube may already be labelled and full of blood.
 */
CREATE OR REPLACE FUNCTION ensure_lab_samples(p_order_id uuid)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  v_tenant    uuid;
  v_accession text;
  v_next      int;
  r           record;
  v_sample    uuid;
  n_new       int := 0;
BEGIN
  SELECT tenant_id, accession_no INTO v_tenant, v_accession
    FROM lab_orders WHERE id = p_order_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Lab order % not found', p_order_id USING ERRCODE = 'no_data_found';
  END IF;

  SELECT COALESCE(MAX(tube_no), 0) INTO v_next FROM lab_samples WHERE lab_order_id = p_order_id;

  FOR r IN
    SELECT COALESCE(c.tube_type, 'other') AS tube_type,
           MIN(tt.draw_order) AS draw_order,
           array_agg(c.id) AS test_ids
      FROM lab_order_items loi
      JOIN lab_tests_catalog c ON c.id = loi.test_id
      LEFT JOIN lab_tube_types tt ON tt.code = c.tube_type
     WHERE loi.lab_order_id = p_order_id
     GROUP BY COALESCE(c.tube_type, 'other')
     ORDER BY MIN(tt.draw_order) NULLS LAST
  LOOP
    SELECT id INTO v_sample FROM lab_samples
     WHERE lab_order_id = p_order_id AND tube_type = r.tube_type;

    IF v_sample IS NULL THEN
      v_next := v_next + 1;
      v_sample := gen_random_uuid();
      INSERT INTO lab_samples (id, tenant_id, lab_order_id, tube_no, tube_type, barcode)
      VALUES (v_sample, v_tenant, p_order_id, v_next, r.tube_type,
              COALESCE(v_accession, '') || lpad(v_next::text, 2, '0'));
      n_new := n_new + 1;
    END IF;

    INSERT INTO lab_sample_items (id, tenant_id, sample_id, test_id)
    SELECT gen_random_uuid(), v_tenant, v_sample, t
      FROM unnest(r.test_ids) AS t
    ON CONFLICT (sample_id, test_id) DO NOTHING;
  END LOOP;

  RETURN n_new;
END $$;

-- Backfill every order that already exists, so no order is left with labels
-- that can only be reconstructed by guessing.
DO $$
DECLARE o record;
BEGIN
  FOR o IN SELECT id FROM lab_orders WHERE status <> 'cancelled' LOOP
    PERFORM ensure_lab_samples(o.id);
  END LOOP;
END $$;
