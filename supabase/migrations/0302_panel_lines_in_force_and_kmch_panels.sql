-- KMCH's panels, made to match what KMCH actually reports, and the master
-- Thyroid Profile corrected. Approved by the platform owner on 14 Nov 2026
-- ("do it", after the comparison of KMCH's 3,760 SwiftEHR reports with
-- Uyirly's panels).
--
-- THE PROBLEM WITH CHANGING A PANEL
-- A panel's lines were just "the lines it has now", so adding a line to the
-- Lipid Profile would have put "VLDL — Pending" on every lipid report already
-- released, turning each into an INTERIM report. So each line now records
-- when it joined the panel (created_at) and when it left (retired_at), and an
-- order shows only the lines in force when it was placed — or one that holds
-- a result. Existing lines are dated 2000-01-01, i.e. always in force.
--
-- WHAT CHANGES
--  * Thyroid Profile (T3 T4 TSH) held FREE T3 and FREE T4 — a different test
--    (master "Free Thyroid Profile" exists). Total T3 and T4 replace them for
--    new orders; old orders keep what they were reported with.
--  * Lipid Profile + VLDL, TC/HDL ratio, LDL/HDL ratio (Indian lipid reports
--    print all three; KMCH does).
--  * HbA1c + Estimated Average Glucose (KMCH's "MBG"; ADAG/ADA formula).
--  * LFT + A/G ratio.
--  * Electrolytes + bicarbonate and ionised calcium (KMCH's 5 lines).
--  * ABG with Lactate and VBG with Lactate + Hct, tHb, Na, K, iCa, Cl, glucose
--    (KMCH's blood-gas machine prints all 13 on both).
--  * Blood Group & Rh Factor: an ABO line and an Rh line (no verdict on either).
--  * Blood Sugar – Fasting and Post Prandial: the fasting and the 2-hour line.
--  * Malaria Antigen (PF/PV): a P. falciparum and a P. vivax line.
--  * Scrub Typhus IgG and IgM: an IgG and an IgM line.
--  * KMCH: lines its analyzers do not produce are marked optional — on the CBC
--    (its Erba H360 is a 3-part counter: no basophils, no absolute eosinophil
--    count; Mid fills Monocytes, Granulocytes fill Neutrophils, as 0277
--    designed) and on its two blood-gas tests.
-- No order of KMCH's is affected (it had none); other hospitals' released
-- reports keep exactly the lines they had.

BEGIN;

-- ── 1. Lines know when they were in force ────────────────────────────────────
ALTER TABLE lab_test_analytes ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE lab_test_analytes ADD COLUMN IF NOT EXISTS retired_at timestamptz;
UPDATE lab_test_analytes SET created_at = '2000-01-01T00:00:00Z';
COMMENT ON COLUMN lab_test_analytes.created_at IS
  'When this line joined the panel. An order shows the lines in force when it was placed (0302).';
COMMENT ON COLUMN lab_test_analytes.retired_at IS
  'When this line left the panel. Orders placed before it still show it; later ones do not (0302).';

CREATE OR REPLACE FUNCTION get_order_analyte_form(p_order_id uuid)
RETURNS TABLE (
  test_id        uuid,
  test_name      text,
  analyte_id     uuid,
  code           text,
  name           text,
  short_name     text,
  unit_ucum      text,
  decimals       int,
  display_order  int,
  value_type     text,
  allowed_values text[],
  normal_values  text[],
  normal_text    text,
  ref_low        numeric,
  ref_high       numeric,
  crit_low       numeric,
  crit_high      numeric,
  value_num      numeric,
  value_text     text,
  flag           text
)
LANGUAGE sql STABLE AS $$
  WITH o AS (
    SELECT lo.id, lo.tenant_id, lo.patient_id, COALESCE(lo.ordered_at, now()) AS taken
      FROM lab_orders lo WHERE lo.id = p_order_id
  ),
  pt AS (
    SELECT p.gender AS sex,
           GREATEST(0, ((SELECT taken FROM o)::date - p.dob))::int AS age_days
      FROM patients p WHERE p.id = (SELECT patient_id FROM o)
  )
  SELECT
    c.id, c.name,
    a.id, a.code, a.name, a.short_name, a.unit_ucum, a.decimals, ta.display_order,
    a.value_type, a.allowed_values, a.normal_values, r.normal_text,
    r.ref_low, r.ref_high, r.crit_low, r.crit_high,
    res.value_num, res.value_text, COALESCE(res.flag, 'pending')
  FROM lab_order_items loi
  JOIN lab_tests_catalog c   ON c.id = loi.test_id
  JOIN lab_test_analytes ta  ON ta.lab_master_id = c.lab_master_id
  JOIN lab_analytes a        ON a.id = ta.analyte_id AND a.is_active
  CROSS JOIN pt
  LEFT JOIN LATERAL resolve_reference_range(
      a.id, (SELECT tenant_id FROM o), pt.sex, pt.age_days) r ON true
  LEFT JOIN lab_result_analytes res
      ON res.lab_order_id = p_order_id AND res.test_id = c.id AND res.analyte_id = a.id
  WHERE loi.lab_order_id = p_order_id
    -- 0302: only the lines the test had when it was ordered (or one already
    -- answered), so adding or retiring a line never rewrites an old order.
    AND ((ta.created_at <= (SELECT taken FROM o)
          AND (ta.retired_at IS NULL OR ta.retired_at > (SELECT taken FROM o)))
         OR res.analyte_id IS NOT NULL)
  ORDER BY c.name, ta.display_order
$$;


CREATE OR REPLACE FUNCTION public.get_lab_report_analytes(p_order_id uuid)
 RETURNS TABLE(department text, test_id uuid, test_name text, test_code text, sample_type text,
               referred_to text, referred_nabl text, analyte_id uuid, name text, short_name text,
               unit_ucum text, decimals integer, value_type text, display_order integer,
               value_num numeric, value_text text, ref_low numeric, ref_high numeric,
               normal_text text, flag text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH o AS (
    SELECT lo.tenant_id, lo.patient_id, COALESCE(lo.ordered_at, now()) AS taken
      FROM lab_orders lo WHERE lo.id = p_order_id
  ),
  pt AS (
    SELECT p.gender AS sex,
           GREATEST(0, ((SELECT taken FROM o)::date - p.dob))::int AS age_days
      FROM patients p WHERE p.id = (SELECT patient_id FROM o)
  )
  SELECT COALESCE(c.department, 'Clinical Biochemistry'),
         c.id, c.name, c.code, c.sample_type,
         rl.name, rl.nabl_number,
         a.id, a.name, a.short_name,
         COALESCE(r.unit_ucum, a.unit_ucum), a.decimals, a.value_type,
         ta.display_order,
         r.value_num, r.value_text,
         CASE WHEN r.analyte_id IS NULL THEN cur.ref_low  ELSE r.ref_low  END,
         CASE WHEN r.analyte_id IS NULL THEN cur.ref_high ELSE r.ref_high END,
         COALESCE(
           r.normal_text,
           CASE a.value_type
             WHEN 'ordinal' THEN array_to_string(a.normal_values, ' / ')
             WHEN 'text'    THEN cur.normal_text
           END),
         COALESCE(r.flag, 'pending')
    FROM lab_order_items i
    JOIN lab_tests_catalog c  ON c.id = i.test_id
    JOIN lab_test_analytes ta ON ta.lab_master_id = c.lab_master_id
    JOIN lab_analytes a       ON a.id = ta.analyte_id
    LEFT JOIN pt ON true
    LEFT JOIN LATERAL resolve_reference_range(a.id, i.tenant_id, pt.sex, pt.age_days) cur ON true
    LEFT JOIN lab_result_analytes r
           ON r.lab_order_id = i.lab_order_id
          AND r.test_id      = i.test_id
          AND r.analyte_id   = a.id
    LEFT JOIN lab_referral_labs rl ON rl.id = c.referral_lab_id
   WHERE i.lab_order_id = p_order_id
     -- 0302: the lines in force when the order was placed, or answered.
     AND ((ta.created_at <= (SELECT taken FROM o)
           AND (ta.retired_at IS NULL OR ta.retired_at > (SELECT taken FROM o)))
          OR r.analyte_id IS NOT NULL)
     AND (
       EXISTS (SELECT 1 FROM lab_result_analytes r2
                WHERE r2.lab_order_id = i.lab_order_id AND r2.test_id = i.test_id)
       OR (i.result_value IS NULL AND i.result_text IS NULL)
     )
     AND NOT (
       r.value_num IS NULL AND COALESCE(r.value_text, '') = ''
       AND EXISTS (SELECT 1 FROM lab_optional_analytes o
                    WHERE o.tenant_id = i.tenant_id
                      AND o.test_id = i.test_id
                      AND o.analyte_id = a.id)
     )
   ORDER BY CASE COALESCE(c.department, 'Clinical Biochemistry')
              WHEN 'Haematology'                    THEN 1
              WHEN 'Clinical Biochemistry'          THEN 2
              WHEN 'Clinical Pathology'             THEN 3
              WHEN 'Microbiology & Serology'        THEN 4
              WHEN 'Immunohaematology (Blood Bank)' THEN 5
              WHEN 'Molecular Biology'              THEN 6
              ELSE 7
            END,
            c.name, ta.display_order
$function$;

CREATE OR REPLACE FUNCTION public.effective_test_range(p_order_id uuid, p_test_id uuid)
RETURNS TABLE (
  ref_low      numeric,
  ref_high     numeric,
  crit_low     numeric,
  crit_high    numeric,
  range_source text
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant   uuid;
  v_patient  uuid;
  v_taken    timestamptz;
  v_sex      text;
  v_age_days int;
  v_analyte  uuid;
  v_count    int;
  cat        lab_tests_catalog;
  rng        lab_reference_ranges;
BEGIN
  SELECT o.tenant_id, o.patient_id, COALESCE(o.ordered_at, now())
    INTO v_tenant, v_patient, v_taken
    FROM lab_orders o
   WHERE o.id = p_order_id;
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO cat FROM lab_tests_catalog WHERE id = p_test_id;
  IF cat.id IS NULL THEN
    RETURN;
  END IF;

  SELECT p.gender, GREATEST(0, (v_taken::date - p.dob))::int
    INTO v_sex, v_age_days
    FROM patients p
   WHERE p.id = v_patient;

  IF cat.lab_master_id IS NOT NULL THEN
    -- 0302: count the lines in force when the order was placed.
    SELECT count(*), min(la.analyte_id::text)::uuid INTO v_count, v_analyte
      FROM lab_test_analytes la
     WHERE la.lab_master_id = cat.lab_master_id
       AND la.created_at <= v_taken
       AND (la.retired_at IS NULL OR la.retired_at > v_taken);

    IF v_count = 1 THEN
      SELECT * INTO rng
        FROM resolve_reference_range(v_analyte, v_tenant, v_sex, v_age_days);
    END IF;
  END IF;

  IF rng.analyte_id IS NOT NULL THEN
    RETURN QUERY SELECT
      rng.ref_low,
      rng.ref_high,
      COALESCE(rng.crit_low,  cat.crit_low),
      COALESCE(rng.crit_high, cat.crit_high),
      'analyte'::text;
  ELSE
    RETURN QUERY SELECT
      cat.ref_low, cat.ref_high, cat.crit_low, cat.crit_high,
      'catalog'::text;
  END IF;
END;
$function$;

-- ── 2. New measurements ──────────────────────────────────────────────────────
INSERT INTO lab_analytes (id, code, name, short_name, unit_ucum, decimals, value_type, allowed_values, normal_values) VALUES
  (gen_random_uuid(), 'VLDL',      'VLDL Cholesterol',               'VLDL',            'mg/dL', 0, 'numeric', NULL, NULL),
  (gen_random_uuid(), 'TC_HDL',    'Total Cholesterol / HDL Ratio',  'TC/HDL Ratio',    NULL,    1, 'numeric', NULL, NULL),
  (gen_random_uuid(), 'LDL_HDL',   'LDL / HDL Ratio',                'LDL/HDL Ratio',   NULL,    1, 'numeric', NULL, NULL),
  (gen_random_uuid(), 'EAG',       'Estimated Average Glucose',      'Mean Blood Glucose', 'mg/dL', 0, 'numeric', NULL, NULL),
  (gen_random_uuid(), 'AG_RATIO',  'Albumin / Globulin Ratio',       'A/G Ratio',       NULL,    2, 'numeric', NULL, NULL),
  (gen_random_uuid(), 'BG_ABO',    'ABO Blood Group',                'Blood Group',     NULL,    0, 'ordinal', ARRAY['A','B','AB','O'], NULL),
  (gen_random_uuid(), 'BG_RH',     'Rh (D) Type',                    'Rh Type',         NULL,    0, 'ordinal', ARRAY['Positive','Negative'], NULL),
  (gen_random_uuid(), 'MAL_PF',    'Plasmodium falciparum Antigen',  'P. falciparum',   NULL,    0, 'ordinal', ARRAY['Negative','Positive'], ARRAY['Negative']),
  (gen_random_uuid(), 'MAL_PV',    'Plasmodium vivax Antigen',       'P. vivax',        NULL,    0, 'ordinal', ARRAY['Negative','Positive'], ARRAY['Negative']),
  (gen_random_uuid(), 'SCRUB_IGG', 'Scrub Typhus IgG',               'Scrub Typhus IgG', NULL,   0, 'ordinal', ARRAY['Negative','Positive'], ARRAY['Negative']),
  (gen_random_uuid(), 'SCRUB_IGM', 'Scrub Typhus IgM',               'Scrub Typhus IgM', NULL,   0, 'ordinal', ARRAY['Negative','Positive'], ARRAY['Negative'])
ON CONFLICT (code) DO NOTHING;

INSERT INTO lab_reference_ranges
  (id, tenant_id, analyte_id, sex, age_min_days, age_max_days, ref_low, ref_high, source, source_note)
SELECT gen_random_uuid(), NULL, a.id, 'any', 6570, 54750, v.lo, v.hi, 'uyirly_standard', v.note
  FROM (VALUES
    ('VLDL',     2::numeric, 30::numeric, 'Indian lipid reports: VLDL 2–30 mg/dL (triglycerides ÷ 5, with triglycerides < 150)'),
    ('TC_HDL',   NULL,       5.0,         'Indian lipid reports: above 5.0 is high risk (desirable 3.5–4.5)'),
    ('LDL_HDL',  NULL,       3.5,         'Indian lipid reports: above 3.5 is high risk (desirable 2.5–3.0)'),
    ('EAG',      NULL,       117,         'ADAG / ADA: eAG = 28.7 × HbA1c − 46.7; HbA1c 5.7% ≈ 117 mg/dL'),
    ('AG_RATIO', 1.2,        2.2,         'Uyirly master A:G Ratio 1.2–2.2')
  ) AS v(code, lo, hi, note)
  JOIN lab_analytes a ON a.code = v.code
 WHERE NOT EXISTS (SELECT 1 FROM lab_reference_ranges r
                    WHERE r.analyte_id = a.id AND r.tenant_id IS NULL AND r.sex = 'any'
                      AND r.age_min_days = 6570 AND r.age_max_days = 54750);

-- ── 3. Thyroid Profile: total T3 and T4, not free ───────────────────────────
UPDATE lab_test_analytes ta SET retired_at = now()
  FROM lab_tests_master m, lab_analytes a
 WHERE ta.lab_master_id = m.id AND ta.analyte_id = a.id
   AND m.name = 'Thyroid Profile (T3 T4 TSH)' AND a.code IN ('FT3', 'FT4')
   AND ta.retired_at IS NULL;

-- ── 4. New lines (dated now: only new orders get them) ──────────────────────
INSERT INTO lab_test_analytes (id, lab_master_id, analyte_id, display_order, created_at)
SELECT gen_random_uuid(), m.id, a.id, v.ord, now()
  FROM (VALUES
    ('Thyroid Profile (T3 T4 TSH)', NULL, 'T3', 1), ('Thyroid Profile (T3 T4 TSH)', NULL, 'T4', 2),
    ('Lipid Profile (Full)', NULL, 'VLDL', 5), ('Lipid Profile (Full)', NULL, 'TC_HDL', 6), ('Lipid Profile (Full)', NULL, 'LDL_HDL', 7),
    ('HbA1c (Glycated Haemoglobin)', NULL, 'EAG', 2),
    ('Liver Function Test (LFT)', NULL, 'AG_RATIO', 10),
    ('Electrolytes', 'General', 'HCO3', 4), ('Electrolytes', 'General', 'ICA', 5),
    ('Arterial Blood Gas (ABG) with Lactate', 'General', 'BG_HCT', 11), ('Arterial Blood Gas (ABG) with Lactate', 'General', 'BG_THB', 12),
    ('Arterial Blood Gas (ABG) with Lactate', 'General', 'NA', 13),     ('Arterial Blood Gas (ABG) with Lactate', 'General', 'K', 14),
    ('Arterial Blood Gas (ABG) with Lactate', 'General', 'ICA', 15),    ('Arterial Blood Gas (ABG) with Lactate', 'General', 'CL', 16),
    ('Arterial Blood Gas (ABG) with Lactate', 'General', 'BG_GLU', 17),
    ('Venous Blood Gas (VBG) with Lactate', 'General', 'BG_HCT', 11),   ('Venous Blood Gas (VBG) with Lactate', 'General', 'BG_THB', 12),
    ('Venous Blood Gas (VBG) with Lactate', 'General', 'NA', 13),       ('Venous Blood Gas (VBG) with Lactate', 'General', 'K', 14),
    ('Venous Blood Gas (VBG) with Lactate', 'General', 'ICA', 15),      ('Venous Blood Gas (VBG) with Lactate', 'General', 'CL', 16),
    ('Venous Blood Gas (VBG) with Lactate', 'General', 'BG_GLU', 17),
    ('Blood Group & Rh Factor', NULL, 'BG_ABO', 1), ('Blood Group & Rh Factor', NULL, 'BG_RH', 2),
    ('Blood Sugar – Fasting and Post Prandial', 'General', 'FBG', 1), ('Blood Sugar – Fasting and Post Prandial', 'General', 'PPBG', 2),
    ('Malaria Antigen (PF/PV)', NULL, 'MAL_PF', 1), ('Malaria Antigen (PF/PV)', NULL, 'MAL_PV', 2),
    ('Scrub Typhus Antibody IgG and IgM', 'General', 'SCRUB_IGG', 1), ('Scrub Typhus Antibody IgG and IgM', 'General', 'SCRUB_IGM', 2)
  ) AS v(master_name, master_category, code, ord)
  JOIN lab_tests_master m ON m.name = v.master_name AND m.is_active
                         AND (v.master_category IS NULL OR m.category = v.master_category)
  JOIN lab_analytes a ON a.code = v.code
ON CONFLICT (lab_master_id, analyte_id) DO NOTHING;

DO $$
DECLARE n int; r int;
BEGIN
  SELECT count(*) INTO n FROM lab_test_analytes WHERE created_at > '2000-01-02';
  SELECT count(*) INTO r FROM lab_test_analytes WHERE retired_at IS NOT NULL;
  IF n <> 31 OR r <> 2 THEN
    RAISE EXCEPTION '0302: expected 31 new lines and 2 retired, got % and %', n, r;
  END IF;
END $$;

-- ── 5. KMCH: lines its machines do not produce are optional ─────────────────
DO $$
DECLARE v_kmch uuid; n int;
BEGIN
  SELECT id INTO v_kmch FROM tenants WHERE slug = 'karur';
  WITH want(test_name, code) AS (VALUES
    ('Complete Blood Count (CBC)', 'EOS_ABS'),  ('Complete Blood Count (CBC)', 'BASO_PCT'),
    ('Complete Blood Count (CBC)', 'BASO_ABS'), ('Complete Blood Count (CBC)', 'MONO_PCT'),
    ('Complete Blood Count (CBC)', 'P_LCC'),    ('Complete Blood Count (CBC)', 'P_LCR'),
    ('Complete Blood Count (CBC)', 'PDW_SD'),   ('Complete Blood Count (CBC)', 'MENTZER'),
    ('Complete Blood Count (CBC)', 'RDWI'),
    ('Arterial Blood Gas (ABG) with Lactate', 'HCO3_STD'), ('Arterial Blood Gas (ABG) with Lactate', 'BE_B'),
    ('Arterial Blood Gas (ABG) with Lactate', 'TCO2'),     ('Arterial Blood Gas (ABG) with Lactate', 'SO2'),
    ('Venous Blood Gas (VBG) with Lactate', 'HCO3_STD'),   ('Venous Blood Gas (VBG) with Lactate', 'BE_B'),
    ('Venous Blood Gas (VBG) with Lactate', 'TCO2'),       ('Venous Blood Gas (VBG) with Lactate', 'SO2')
  ), rows AS (
    SELECT c.id AS test_id, a.id AS analyte_id
      FROM want w
      JOIN lab_tests_catalog c  ON c.tenant_id = v_kmch AND c.name = w.test_name AND c.is_active
      JOIN lab_analytes a       ON a.code = w.code
      JOIN lab_test_analytes ta ON ta.lab_master_id = c.lab_master_id AND ta.analyte_id = a.id AND ta.retired_at IS NULL
  ), ins AS (
    INSERT INTO lab_optional_analytes (tenant_id, test_id, analyte_id, created_by)
    SELECT v_kmch, r.test_id, r.analyte_id, NULL FROM rows r
    ON CONFLICT DO NOTHING
    RETURNING test_id, analyte_id
  ), logged AS (
    INSERT INTO audit_logs (id, tenant_id, actor_id, action, entity, entity_id, meta)
    SELECT gen_random_uuid(), v_kmch, NULL, 'update', 'lab_test', i.test_id,
           jsonb_build_object('change', 'measurement marked optional', 'measurement', a.code,
                              'why', 'KMCH''s analyzer does not produce it (its SwiftEHR reports)',
                              'note', 'Uyirly support, approved by platform owner (14 Nov 2026)', 'migration', '0302')
      FROM ins i JOIN lab_analytes a ON a.id = i.analyte_id
    RETURNING 1
  )
  SELECT count(*) INTO n FROM logged;
  IF n <> 17 THEN RAISE EXCEPTION '0302: expected 17 optional lines for KMCH, would add %', n; END IF;
END $$;

COMMIT;
