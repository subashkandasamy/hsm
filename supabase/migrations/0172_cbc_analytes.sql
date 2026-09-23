-- The CBC, as twenty measurements instead of one number.
--
-- Starting with the CBC because it is the highest-volume test in an Indian
-- general hospital, and because it is what a haematology analyzer sends — so
-- this is also the panel the first machine will write into.
--
-- ── On the reference ranges, and what is deliberately missing ───────────────
--
-- NABL 112 §5.7 permits published intervals provided the laboratory evaluates
-- them and retains the documentation. So every range here carries its citation
-- in source_note, and that note is the documentation.
--
-- Only three analytes get ranges in this migration — haemoglobin, platelets and
-- ESR — because those are the ones a real Indian multicentric study gives
-- numbers for that I can cite. The other seventeen are left NULL on purpose.
--
-- That is not a gap, it is the correct sequencing. Dacie & Lewis and NABL both
-- note that haematology intervals shift with the analyzer and the reagent, so
-- for a CBC the best source is the manual of the machine standing in the
-- laboratory. The hospital will have that manual when the analyzer arrives.
-- Inventing numbers now and labelling them "standard" would be manufacturing
-- exactly the documentation NABL asks us to retain honestly.
--
-- The interface shows an unset range as "your laboratory must set this" rather
-- than pretending a result is normal.

INSERT INTO lab_analytes (id, code, name, short_name, unit_ucum, decimals) VALUES
  (gen_random_uuid(), 'WBC',       'Total Leucocyte Count',        'WBC',    '10*9/L',  2),
  (gen_random_uuid(), 'RBC',       'Red Blood Cell Count',         'RBC',    '10*12/L', 2),
  (gen_random_uuid(), 'HGB',       'Haemoglobin',                  'Hb',     'g/dL',    1),
  (gen_random_uuid(), 'HCT',       'Haematocrit',                  'PCV',    '%',       1),
  (gen_random_uuid(), 'MCV',       'Mean Corpuscular Volume',      'MCV',    'fL',      1),
  (gen_random_uuid(), 'MCH',       'Mean Corpuscular Haemoglobin', 'MCH',    'pg',      1),
  (gen_random_uuid(), 'MCHC',      'Mean Corpuscular Hb Conc.',    'MCHC',   'g/dL',    1),
  (gen_random_uuid(), 'RDW_CV',    'Red Cell Distribution Width',  'RDW-CV', '%',       1),
  (gen_random_uuid(), 'PLT',       'Platelet Count',               'Platelets', '10*9/L', 0),
  (gen_random_uuid(), 'MPV',       'Mean Platelet Volume',         'MPV',    'fL',      1),
  (gen_random_uuid(), 'NEUT_PCT',  'Neutrophils',                  'Neutrophils', '%',  1),
  (gen_random_uuid(), 'LYMPH_PCT', 'Lymphocytes',                  'Lymphocytes', '%',  1),
  (gen_random_uuid(), 'MONO_PCT',  'Monocytes',                    'Monocytes',   '%',  1),
  (gen_random_uuid(), 'EOS_PCT',   'Eosinophils',                  'Eosinophils', '%',  1),
  (gen_random_uuid(), 'BASO_PCT',  'Basophils',                    'Basophils',   '%',  1),
  (gen_random_uuid(), 'NEUT_ABS',  'Absolute Neutrophil Count',    'ANC',    '10*9/L',  2),
  (gen_random_uuid(), 'LYMPH_ABS', 'Absolute Lymphocyte Count',    'ALC',    '10*9/L',  2),
  (gen_random_uuid(), 'MONO_ABS',  'Absolute Monocyte Count',      'AMC',    '10*9/L',  2),
  (gen_random_uuid(), 'EOS_ABS',   'Absolute Eosinophil Count',    'AEC',    '10*9/L',  2),
  (gen_random_uuid(), 'BASO_ABS',  'Absolute Basophil Count',      'ABC',    '10*9/L',  2),
  (gen_random_uuid(), 'ESR',       'Erythrocyte Sedimentation Rate', 'ESR',  'mm/h',    0)
ON CONFLICT (code) DO NOTHING;

-- ── Panel membership: what a CBC contains, in report order ──────────────────

INSERT INTO lab_test_analytes (id, lab_master_id, analyte_id, display_order)
SELECT gen_random_uuid(), m.id, a.id, x.ord
  FROM lab_tests_master m
  JOIN (VALUES
      ('HGB', 1), ('RBC', 2), ('HCT', 3), ('MCV', 4), ('MCH', 5), ('MCHC', 6),
      ('RDW_CV', 7), ('WBC', 8),
      ('NEUT_PCT', 9), ('LYMPH_PCT', 10), ('MONO_PCT', 11), ('EOS_PCT', 12), ('BASO_PCT', 13),
      ('NEUT_ABS', 14), ('LYMPH_ABS', 15), ('MONO_ABS', 16), ('EOS_ABS', 17), ('BASO_ABS', 18),
      ('PLT', 19), ('MPV', 20)
  ) AS x(code, ord) ON true
  JOIN lab_analytes a ON a.code = x.code
 WHERE m.code = 'CBC'
ON CONFLICT (lab_master_id, analyte_id) DO NOTHING;

-- ESR is its own test, not part of the CBC panel.
INSERT INTO lab_test_analytes (id, lab_master_id, analyte_id, display_order)
SELECT gen_random_uuid(), m.id, a.id, 1
  FROM lab_tests_master m
  JOIN lab_analytes a ON a.code = 'ESR'
 WHERE m.code = 'ESR'
ON CONFLICT (lab_master_id, analyte_id) DO NOTHING;

-- ── Reference intervals, Indian adult population ────────────────────────────
--
-- Sairam & Domalapalli et al., "Hematological and Biochemical Parameters in
-- Apparently Healthy Indian Population: Defining Reference Intervals",
-- Indian Journal of Clinical Biochemistry, 2014. Multicentric study across
-- India, 10,665 apparently healthy reference individuals. PMID 24966476.
--
-- Worth seeing why this matters: the study puts adult female haemoglobin at
-- 9.9–14.3 g/dL. A Western textbook says roughly 12–15. Ship the Western number
-- into an Indian hospital and a large share of perfectly healthy women are
-- flagged anaemic on every report they ever receive.
--
-- Adults only (18 years = 6570 days upward). Paediatric bands are a separate
-- exercise — ICMR's TERIIP taskforce is running a second phase specifically to
-- establish intervals for under-18s in the Indian population, and guessing
-- would be worse than leaving it unset.

WITH src AS (
  SELECT 'Sairam & Domalapalli et al., Indian J Clin Biochem 2014; multicentric Indian study, n=10,665 (PMID 24966476)'::text AS note
)
INSERT INTO lab_reference_ranges
  (id, tenant_id, analyte_id, sex, age_min_days, age_max_days, ref_low, ref_high, source, source_note)
SELECT gen_random_uuid(), NULL, a.id, v.sex, 6570, 54750, v.lo, v.hi, 'uyirly_standard', src.note
  FROM (VALUES
      ('HGB', 'male',   12.3, 17.0),
      ('HGB', 'female',  9.9, 14.3),
      -- Reported in the study as lakhs/µL; 1.3 lakh/µL = 130 × 10⁹/L.
      ('PLT', 'male',   130.0, 380.0),
      ('PLT', 'female', 130.0, 420.0),
      ('ESR', 'male',     2.0,  22.0),
      ('ESR', 'female',   4.0,  55.0)
  ) AS v(code, sex, lo, hi)
  JOIN lab_analytes a ON a.code = v.code
  CROSS JOIN src
 WHERE NOT EXISTS (
   SELECT 1 FROM lab_reference_ranges r
    WHERE r.analyte_id = a.id AND r.tenant_id IS NULL
      AND r.sex = v.sex AND r.age_min_days = 6570
 );

COMMENT ON TABLE lab_reference_ranges IS
  'Reference and critical limits. tenant_id NULL is the Uyirly standard shipped with every tenant; a row with a tenant_id is that hospital''s own decision and always wins. source_note carries the citation, which is the documentation NABL 112 §5.7 requires a laboratory to retain when it adopts published intervals.';
