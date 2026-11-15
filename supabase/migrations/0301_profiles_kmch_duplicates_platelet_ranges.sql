-- Four lab profiles get their measurement lines, KMCH's duplicate tests are
-- switched off, and three platelet indices get Indian reference ranges.
-- Approved by the platform owner on 14 Nov 2026: "keep the higher price,
-- remove the lower price"; "fix it" (the profiles); research how Indian
-- hospitals and labs print the ranges.
--
-- 1. KMCH'S DUPLICATE TESTS — the lower-priced copy is switched off (not
--    deleted; KMCH can switch it back on). KMCH had no lab orders, and none
--    of these is in a package.
--      Blood Sugar Fasting and Post Prandial ₹50   (keeps the ₹120 one)
--      Calcium ₹200                                (keeps Calcium (Total) ₹250)
--      Clotting Time (CT) ₹80                      (keeps Whole Blood Clotting Time ₹100)
--      Estradiol ₹500                              (keeps Estradiol (E2) ₹700)
--      Troponin I — two identical ₹1,500 rows      (keeps one)
--      Nitrite ₹50, Granulocyte ₹20 — parts of Urine Routine (₹200), which
--      reports them; Ketone ₹250 is dearer and stays orderable.
--
-- 2. KMCH'S RFT AND URINE ROUTINE (fixing 0300). 0300 linked KMCH's RFT to
--    Kidney Function Test, which has 7 lines; KMCH's own reports (SwiftEHR)
--    show its RFT is Urea, Creatinine, Uric acid. The other four (BUN,
--    sodium, potassium, chloride — KMCH sells Electrolytes separately) are
--    marked optional for KMCH: blank, they are not printed and do not hold up
--    the report. Same for the five urine lines KMCH does not report
--    (appearance, blood, urobilinogen, leucocytes, crystals).
--
-- 3. THE PROFILES — lines as KMCH reports them (its SwiftEHR reports), the
--    Anemia Profile as Indian labs make it up (Max Lab, Torrent, Redcliffe):
--      Coagulation Profile  PT, INR, APTT
--      Iron Profile         Serum iron, TIBC, UIBC, Transferrin saturation
--      Cardiac Panel        Apo A1, Apo B, Apo B/A1 ratio, hs-CRP — a heart-
--                           RISK panel, so the master name now says so
--      Anemia Profile       Hb, RBC, PCV, MCV, MCH, MCHC, RDW-CV, Retic,
--                           Iron, TIBC, UIBC, Transferrin sat., Ferritin,
--                           Vitamin B12, Folate
--    Eight measurements are new. Ranges are adults (18+), like 0297; the
--    source is on each row. No hospital had ever ordered these profiles, so
--    no existing report changes.
--
-- 4. PLATELET INDICES — PDW-SD, Plateletcrit and P-LCR from the South Indian
--    reference study (Gnanadeepam et al., JCDR 2022, Sysmex XN-1000). Left
--    empty, on purpose: PDW-CV and P-LCC (no Indian study found), Mentzer
--    index and RDWI (screening indices for thalassaemia, not normal ranges),
--    pO2 and sO2 (one line serves both arterial and venous blood gas, whose
--    normals differ).

BEGIN;

-- ── 1. KMCH's duplicates ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_kmch uuid;
  n int;
BEGIN
  SELECT id INTO v_kmch FROM tenants WHERE slug = 'karur';
  IF v_kmch IS NULL THEN RAISE EXCEPTION '0301: tenant karur not found'; END IF;

  WITH off(id, why) AS (VALUES
    ('14fceeed-1552-4abd-8664-3cc9c186030c'::uuid, 'duplicate of Blood Sugar – Fasting and Post Prandial (₹120); kept the higher price'),
    ('d8874daf-d6d6-4015-b902-6a567ba877ea'::uuid, 'duplicate of Calcium (Total) (₹250); kept the higher price'),
    ('d2b524f0-05b1-4743-86ae-a05f014c5b84'::uuid, 'duplicate of Whole Blood Clotting Time (₹100); kept the higher price'),
    ('6b089689-9235-452c-87db-f9c58ac5860c'::uuid, 'duplicate of Estradiol (E2) (₹700); kept the higher price'),
    ('67299bd0-cd80-4051-9b12-9201cc5becfd'::uuid, 'second identical Troponin I (₹1,500)'),
    ('64bb1d4a-88a3-45c1-893c-8b555f73db54'::uuid, 'part of Urine Routine (₹200), which reports it'),
    ('048e3abd-320a-4f0f-8a41-567c5c00fc3c'::uuid, 'part of Urine Routine (₹200), which reports it')
  ), done AS (
    UPDATE lab_tests_catalog c SET is_active = false
      FROM off WHERE c.id = off.id AND c.tenant_id = v_kmch AND c.is_active
    RETURNING c.id, c.name, c.price, off.why
  ), logged AS (
    INSERT INTO audit_logs (id, tenant_id, actor_id, action, entity, entity_id, meta)
    SELECT gen_random_uuid(), v_kmch, NULL, 'update', 'lab_test', d.id,
           jsonb_build_object('change', 'switched off', 'name', d.name, 'price', d.price, 'why', d.why,
                              'note', 'Uyirly support, approved by platform owner (14 Nov 2026)', 'migration', '0301')
      FROM done d
    RETURNING 1
  )
  SELECT count(*) INTO n FROM logged;
  IF n <> 7 THEN RAISE EXCEPTION '0301: expected to switch off 7 KMCH duplicates, would switch off %', n; END IF;

  -- ── 2. KMCH's RFT and Urine Routine: lines KMCH does not report ──────────
  WITH want(test_name, code) AS (VALUES
    ('Renal Function Test (RFT)', 'BUN'), ('Renal Function Test (RFT)', 'NA'),
    ('Renal Function Test (RFT)', 'K'),   ('Renal Function Test (RFT)', 'CL'),
    ('Urine Routine and Microscopy', 'UR_APPEAR'), ('Urine Routine and Microscopy', 'UR_BLOOD'),
    ('Urine Routine and Microscopy', 'UR_URO'),    ('Urine Routine and Microscopy', 'UR_LEU'),
    ('Urine Routine and Microscopy', 'UR_CRYST')
  ), rows AS (
    SELECT c.id AS test_id, a.id AS analyte_id, c.name, a.code
      FROM want w
      JOIN lab_tests_catalog c ON c.tenant_id = v_kmch AND c.name = w.test_name AND c.is_active
      JOIN lab_analytes a      ON a.code = w.code
      JOIN lab_test_analytes ta ON ta.lab_master_id = c.lab_master_id AND ta.analyte_id = a.id
  ), ins AS (
    INSERT INTO lab_optional_analytes (tenant_id, test_id, analyte_id, created_by)
    SELECT v_kmch, r.test_id, r.analyte_id, NULL FROM rows r
    ON CONFLICT DO NOTHING
    RETURNING test_id, analyte_id
  ), logged AS (
    INSERT INTO audit_logs (id, tenant_id, actor_id, action, entity, entity_id, meta)
    SELECT gen_random_uuid(), v_kmch, NULL, 'update', 'lab_test', i.test_id,
           jsonb_build_object('change', 'measurement marked optional', 'measurement', a.code,
                              'why', 'KMCH does not report it in this test (its SwiftEHR reports)',
                              'note', 'Uyirly support, approved by platform owner (14 Nov 2026)', 'migration', '0301')
      FROM ins i JOIN lab_analytes a ON a.id = i.analyte_id
    RETURNING 1
  )
  SELECT count(*) INTO n FROM logged;
  IF n <> 9 THEN RAISE EXCEPTION '0301: expected 9 optional lines for KMCH, would add %', n; END IF;
END $$;

-- ── 3a. The new measurements ─────────────────────────────────────────────────
INSERT INTO lab_analytes (id, code, name, short_name, unit_ucum, decimals, value_type) VALUES
  (gen_random_uuid(), 'IRON',     'Serum Iron',                          'Iron',             'ug/dL', 0, 'numeric'),
  (gen_random_uuid(), 'TIBC',     'Total Iron Binding Capacity',         'TIBC',             'ug/dL', 0, 'numeric'),
  (gen_random_uuid(), 'UIBC',     'Unsaturated Iron Binding Capacity',   'UIBC',             'ug/dL', 0, 'numeric'),
  (gen_random_uuid(), 'TSAT',     'Transferrin Saturation',              'Transferrin Sat.', '%',     1, 'numeric'),
  (gen_random_uuid(), 'FERRITIN', 'Serum Ferritin',                      'Ferritin',         'ng/mL', 1, 'numeric'),
  (gen_random_uuid(), 'VITB12',   'Vitamin B12',                         'Vitamin B12',      'pg/mL', 0, 'numeric'),
  (gen_random_uuid(), 'FOLATE',   'Serum Folate',                        'Folate',           'ng/mL', 1, 'numeric'),
  (gen_random_uuid(), 'RETIC',    'Reticulocyte Count',                  'Reticulocytes',    '%',     1, 'numeric'),
  (gen_random_uuid(), 'APOA1',    'Apolipoprotein A1',                   'Apo A1',           'mg/dL', 0, 'numeric'),
  (gen_random_uuid(), 'APOB',     'Apolipoprotein B',                    'Apo B',            'mg/dL', 0, 'numeric'),
  (gen_random_uuid(), 'APOB_A1',  'Apo B / Apo A1 Ratio',                'Apo B/A1 Ratio',   NULL,    2, 'numeric'),
  (gen_random_uuid(), 'HSCRP',    'High Sensitivity C-Reactive Protein', 'hs-CRP',           'mg/L',  2, 'numeric')
ON CONFLICT (code) DO NOTHING;

-- ── 3b and 4. Uyirly standard ranges, adults (18+) ───────────────────────────
INSERT INTO lab_reference_ranges
  (id, tenant_id, analyte_id, sex, age_min_days, age_max_days, ref_low, ref_high, source, source_note)
SELECT gen_random_uuid(), NULL, a.id, v.sex, 6570, 54750, v.lo, v.hi, 'uyirly_standard', v.note
  FROM (VALUES
    ('IRON',     'male',   65::numeric,  175::numeric, 'Redcliffe Labs adult serum iron range (men 65–175, women 50–170 µg/dL)'),
    ('IRON',     'female', 50,           170,          'Redcliffe Labs adult serum iron range (men 65–175, women 50–170 µg/dL)'),
    ('TIBC',     'any',    250,          450,          'Indian lab sources (Redcliffe Labs and others): TIBC 250–450 µg/dL'),
    ('UIBC',     'any',    110,          370,          'Mayo Clinic Laboratories 110–367 µg/dL, rounded; other labs 110–375'),
    ('TSAT',     'any',    20,           50,           'Indian lab sources: transferrin saturation 20–50%'),
    ('FERRITIN', 'male',   24,           336,          'Indian lab listings (Apollo Diagnostics, Max Lab): men 24–336, women 11–307 ng/mL'),
    ('FERRITIN', 'female', 11,           307,          'Indian lab listings (Apollo Diagnostics, Max Lab): men 24–336, women 11–307 ng/mL'),
    ('VITB12',   'any',    197,          771,          'Roche Elecsys / cobas Vitamin B12 II insert, adults 197–771 pg/mL (cited by UH Sussex pathology)'),
    ('FOLATE',   'any',    4.8,          24.2,         'Roche Elecsys Folate, adults 4.8–24.2 ng/mL (FDA 510(k) K141426 summary)'),
    ('RETIC',    'any',    0.5,          2.5,          'Adults 0.5–2.5% (AIIMS New Delhi authors, Pan African Med J; Indian lab listings)'),
    ('APOA1',    'male',   105,          175,          'Max Lab (Mumbai) apolipoprotein A1/B: Apo A1 men 105–175, women 105–205 mg/dL'),
    ('APOA1',    'female', 105,          205,          'Max Lab (Mumbai) apolipoprotein A1/B: Apo A1 men 105–175, women 105–205 mg/dL'),
    ('APOB',     'male',   60,           140,          'Max Lab (Mumbai) apolipoprotein A1/B: Apo B men 60–140, women 55–130 mg/dL'),
    ('APOB',     'female', 55,           130,          'Max Lab (Mumbai) apolipoprotein A1/B: Apo B men 60–140, women 55–130 mg/dL'),
    ('APOB_A1',  'male',   NULL,         0.9,          'Lupin Diagnostics risk bands: men above 0.9, women above 0.8 is higher risk'),
    ('APOB_A1',  'female', NULL,         0.8,          'Lupin Diagnostics risk bands: men above 0.9, women above 0.8 is higher risk'),
    ('HSCRP',    'any',    NULL,         3.0,          'AHA/CDC 2003 cardiovascular risk: < 1 low, 1–3 average, > 3 high (flagged at high)'),
    ('PDW_SD',   'male',   9.0,          16.4,         'Gnanadeepam et al., JCDR 2022 — South Indian adults, Sysmex XN-1000'),
    ('PDW_SD',   'female', 9.1,          16.6,         'Gnanadeepam et al., JCDR 2022 — South Indian adults, Sysmex XN-1000'),
    ('PCT',      'male',   0.15,         0.36,         'Gnanadeepam et al., JCDR 2022 — South Indian adults, Sysmex XN-1000'),
    ('PCT',      'female', 0.14,         0.41,         'Gnanadeepam et al., JCDR 2022 — South Indian adults, Sysmex XN-1000'),
    ('P_LCR',    'male',   16,           42.1,         'Gnanadeepam et al., JCDR 2022 — South Indian adults, Sysmex XN-1000'),
    ('P_LCR',    'female', 16.6,         43,           'Gnanadeepam et al., JCDR 2022 — South Indian adults, Sysmex XN-1000')
  ) AS v(code, sex, lo, hi, note)
  JOIN lab_analytes a ON a.code = v.code
 WHERE NOT EXISTS (
   SELECT 1 FROM lab_reference_ranges r
    WHERE r.analyte_id = a.id AND r.tenant_id IS NULL AND r.sex = v.sex
      AND r.age_min_days = 6570 AND r.age_max_days = 54750
 );

-- ── 3c. The profiles' lines ──────────────────────────────────────────────────
INSERT INTO lab_test_analytes (id, lab_master_id, analyte_id, display_order)
SELECT gen_random_uuid(), m.id, a.id, v.ord
  FROM (VALUES
    ('Coagulation Profile', 'PT_SEC', 1), ('Coagulation Profile', 'INR', 2), ('Coagulation Profile', 'APTT_SEC', 3),
    ('Iron Profile with TIBC and Transferrin Saturation', 'IRON', 1),
    ('Iron Profile with TIBC and Transferrin Saturation', 'TIBC', 2),
    ('Iron Profile with TIBC and Transferrin Saturation', 'UIBC', 3),
    ('Iron Profile with TIBC and Transferrin Saturation', 'TSAT', 4),
    ('Cardiac Panel', 'APOA1', 1), ('Cardiac Panel', 'APOB', 2), ('Cardiac Panel', 'APOB_A1', 3), ('Cardiac Panel', 'HSCRP', 4),
    ('Anemia Profile', 'HGB', 1),  ('Anemia Profile', 'RBC', 2),   ('Anemia Profile', 'HCT', 3),
    ('Anemia Profile', 'MCV', 4),  ('Anemia Profile', 'MCH', 5),   ('Anemia Profile', 'MCHC', 6),
    ('Anemia Profile', 'RDW_CV', 7), ('Anemia Profile', 'RETIC', 8), ('Anemia Profile', 'IRON', 9),
    ('Anemia Profile', 'TIBC', 10), ('Anemia Profile', 'UIBC', 11), ('Anemia Profile', 'TSAT', 12),
    ('Anemia Profile', 'FERRITIN', 13), ('Anemia Profile', 'VITB12', 14), ('Anemia Profile', 'FOLATE', 15)
  ) AS v(master_name, code, ord)
  JOIN lab_tests_master m ON m.name = v.master_name AND m.category = 'General'
  JOIN lab_analytes a     ON a.code = v.code
ON CONFLICT (lab_master_id, analyte_id) DO NOTHING;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM lab_test_analytes ta JOIN lab_tests_master m ON m.id = ta.lab_master_id
   WHERE m.category = 'General'
     AND m.name IN ('Coagulation Profile', 'Iron Profile with TIBC and Transferrin Saturation', 'Cardiac Panel', 'Anemia Profile');
  IF n <> 26 THEN RAISE EXCEPTION '0301: the four profiles should have 26 lines, have %', n; END IF;
END $$;

-- ── 3d. Out of "General", named for what they are ───────────────────────────
-- The hospital's own test keeps its own name; a "General" group and an empty
-- sample type take the profile's.
WITH p(old_name, new_name, new_category) AS (VALUES
  ('Coagulation Profile', 'Coagulation Profile', 'Coagulation Profile'),
  ('Iron Profile with TIBC and Transferrin Saturation', 'Iron Profile with TIBC and Transferrin Saturation', 'Vitamins & Nutrition'),
  ('Cardiac Panel', 'Cardiac Risk Panel (Apo A1, Apo B, hs-CRP)', 'Cardiac Markers'),
  ('Anemia Profile', 'Anemia Profile', 'Haematology')
), m AS (
  UPDATE lab_tests_master t
     SET name = p.new_name, category = p.new_category, sample_type = COALESCE(t.sample_type, 'blood')
    FROM p WHERE t.name = p.old_name AND t.category = 'General'
  RETURNING t.id, t.category
), c AS (
  UPDATE lab_tests_catalog c
     SET category    = CASE WHEN c.category IS NULL OR c.category = 'General' THEN m.category ELSE c.category END,
         sample_type = COALESCE(NULLIF(btrim(c.sample_type), ''), 'blood')
    FROM m WHERE c.lab_master_id = m.id
  RETURNING c.id, c.tenant_id
)
INSERT INTO audit_logs (id, tenant_id, actor_id, action, entity, entity_id, meta)
SELECT gen_random_uuid(), c.tenant_id, NULL, 'update', 'lab_test', c.id,
       jsonb_build_object('change', 'profile given its measurement lines; group and sample type set',
                          'note', 'Uyirly support, approved by platform owner (14 Nov 2026)', 'migration', '0301')
  FROM c;

COMMIT;
