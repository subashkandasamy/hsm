-- Normal ranges for every test in the master list that can take one.
--
-- Checked one by one on 13 Nov 2026 (591 active master tests):
--   44 tests report result lines; 8 of them had lines with no range — CBC had
--      2 of 28 (only haemoglobin and platelets), so a CBC typed by hand printed
--      26 numbers with no normal range and no High/Low flag.
--   547 tests are one box; 370 had a range, 177 had none. Of the 177, 90 are
--      hidden parts of other tests (never ordered, so never shown) and the rest
--      are below.
--
-- Nothing here overwrites a range that is already set — every statement fills
-- only what is empty — and a hospital's own range (or one learned from its
-- analyzer) always wins over these.
--
-- Deliberately LEFT EMPTY, with the reason, so nobody "fixes" them later:
--   pO2, oxygen saturation (blood gas): the same line serves arterial and
--     venous samples, whose normals differ by half; one range would flag every
--     venous result.
--   Mentzer index, RDW index: thalassaemia-trait cut-offs (Mentzer < 13), not
--     reference intervals; a "low" flag would read as abnormal.
--   PDW (CV and SD), plateletcrit, P-LCR, P-LCC: instrument-specific; each
--     analyzer prints its own, and Uyirly adopts it from the analyzer (0276).
--   Urine colour, appearance, pus cells, RBC, epithelial cells, casts,
--     crystals: written descriptions, not numbers.
--   Children (under 18): as in 0172 — paediatric bands are their own exercise
--     and a guessed number is worse than none.

BEGIN;

-- ── 1. Result lines (CBC, blood gas): adult ranges ──────────────────────────
--
-- Source: Bain BJ, Bates I, Laffan MA (eds). Dacie and Lewis Practical
-- Haematology, 12th ed. Elsevier, 2017 — adult reference ranges. Haemoglobin
-- and platelets keep the Indian population study already used (0172); the
-- blood-gas haemoglobin follows it too, so the two never disagree.

WITH v(code, sex, lo, hi, note) AS (VALUES
  ('WBC',       'any',    4.0,  10.0, 'dacie'),
  ('RBC',       'male',   4.5,   5.5, 'dacie'),
  ('RBC',       'female', 3.8,   4.8, 'dacie'),
  ('HCT',       'male',  40.0,  50.0, 'dacie'),
  ('HCT',       'female',36.0,  46.0, 'dacie'),
  ('MCV',       'any',   83.0, 101.0, 'dacie'),
  ('MCH',       'any',   27.0,  32.0, 'dacie'),
  ('MCHC',      'any',   31.5,  34.5, 'dacie'),
  ('RDW_CV',    'any',   11.6,  14.0, 'dacie'),
  ('RDW_SD',    'any',   39.0,  46.0, 'dacie'),
  ('NEUT_PCT',  'any',   40.0,  80.0, 'dacie'),
  ('LYMPH_PCT', 'any',   20.0,  40.0, 'dacie'),
  ('MONO_PCT',  'any',    2.0,  10.0, 'dacie'),
  ('EOS_PCT',   'any',    1.0,   6.0, 'dacie'),
  ('BASO_PCT',  'any',    0.0,   2.0, 'dacie'),
  ('NEUT_ABS',  'any',    2.0,   7.0, 'dacie'),
  ('LYMPH_ABS', 'any',    1.0,   3.0, 'dacie'),
  ('MONO_ABS',  'any',    0.2,   1.0, 'dacie'),
  ('EOS_ABS',   'any',    0.02,  0.5, 'dacie'),
  ('BASO_ABS',  'any',    0.02,  0.1, 'dacie'),
  ('MPV',       'any',    7.5,  12.5, 'mpv'),
  ('BG_HCT',    'male',  40.0,  50.0, 'dacie'),
  ('BG_HCT',    'female',36.0,  46.0, 'dacie'),
  ('BG_THB',    'male',  12.3,  17.0, 'india'),
  ('BG_THB',    'female', 9.9,  14.3, 'india'),
  ('BG_GLU',    'any',   NULL, 200.0, 'glucose')
),
src(note, text) AS (VALUES
  ('dacie',   'Dacie and Lewis Practical Haematology, 12th ed. (Bain, Bates, Laffan; Elsevier 2017) — adult reference ranges'),
  ('india',   'Sairam & Domalapalli et al., Indian J Clin Biochem 2014; multicentric Indian study, n=10,665 (PMID 24966476) — as for haemoglobin (0172)'),
  ('mpv',     'Uyirly master interval for stand-alone MPV; instrument-dependent — an analyzer''s own printed range replaces it automatically (0276)'),
  ('glucose', 'Random plasma glucose < 200 mg/dL, as for Random Blood Sugar (ADA Standards of Care in Diabetes, diagnostic threshold)')
)
INSERT INTO lab_reference_ranges
  (id, tenant_id, analyte_id, sex, age_min_days, age_max_days, ref_low, ref_high, source, source_note)
SELECT gen_random_uuid(), NULL, a.id, v.sex, 6570, 54750, v.lo, v.hi, 'uyirly_standard', src.text
  FROM v
  JOIN src ON src.note = v.note
  JOIN lab_analytes a ON a.code = v.code
 WHERE NOT EXISTS (
   SELECT 1 FROM lab_reference_ranges r
    WHERE r.analyte_id = a.id AND r.tenant_id IS NULL
      AND r.sex = v.sex AND r.age_min_days = 6570
 );

-- ── 2. One-box master tests with no range at all ────────────────────────────
--
-- Where the master already holds a properly built twin of a test (Fasting
-- Blood Glucose for "Fasting Blood Sugar (FBS)", Serum Ferritin for
-- "Ferritin", Total CK for "CPK" …) the twin's range is used, so one
-- measurement has one normal everywhere in Uyirly. Numbers flag High/Low only
-- where one range fits everyone; a range that differs by sex or time of day is
-- written out in words instead, which prints without a misleading flag.
-- Tests that produce several results (Renal Function Test, Urine Routine,
-- Coagulation / Cardiac / Anaemia / Iron profiles) are left for the next step,
-- which gives them proper result lines.

WITH v(name, unit, lo, hi, txt) AS (VALUES
  -- Blood sugar (twins: Fasting Blood Glucose, Post-Prandial Blood Glucose, Random Blood Sugar)
  ('Fasting Blood Sugar (FBS)',                     'mg/dL',  70::numeric, 100::numeric, '70–100 mg/dL'),
  ('Post Prandial Blood Sugar (PPBS)',              'mg/dL',  NULL, 140,  '< 140 mg/dL'),
  ('Random Sugar',                                  'mg/dL',  NULL, 200,  '< 200 mg/dL'),
  ('Blood Glucose (Glucometer Strip)',              'mg/dL',  NULL, 200,  '< 200 mg/dL (random)'),
  ('Blood Sugar – Fasting and Post Prandial',       'mg/dL',  NULL, NULL, 'Fasting 70–100 mg/dL; 2 h after food < 140 mg/dL'),
  ('Glucose Tolerance Test (GTT)',                  'mg/dL',  NULL, NULL, '75 g: Fasting < 100 mg/dL; 2 h < 140 mg/dL'),
  ('Glucose Challenge Test (GCT)',                  'mg/dL',  NULL, 140,  '1 h after 50 g glucose: < 140 mg/dL'),
  -- Proteins, enzymes, hormones (twins in Cardiac / Tumour / Vitamins / Allergy)
  ('High Sensitivity C-Reactive Protein (hs-CRP)',  'mg/L',   NULL, 1,    '< 1.0 mg/L Low risk; 1–3 Average; > 3 High'),
  ('Alpha Fetoprotein (AFP)',                       'ng/mL',  NULL, 8,    '< 8.0 ng/mL'),
  ('Prostate Specific Antigen (PSA)',               'ng/mL',  NULL, 4,    '< 4.0 ng/mL (age-dependent)'),
  ('Creatine Phosphokinase (CPK)',                  'U/L',    30,   200,  '30–200 U/L'),
  ('Immunoglobulin E (IgE)',                        'IU/mL',  NULL, 100,  '< 100 IU/mL'),
  ('Ferritin',                                      'ng/mL',  12,   300,  '12–300 ng/mL'),
  ('Folic Acid',                                    'ng/mL',  3,    17,   '3.0–17 ng/mL'),
  ('Total Iron Binding Capacity (TIBC)',            'µg/dL',  250,  370,  '250–370 µg/dL'),
  ('Complement ( C3 )',                             'mg/dL',  90,   180,  '90–180 mg/dL'),
  ('Complement ( C4 )',                             'mg/dL',  16,   47,   '16–47 mg/dL'),
  ('Cortisol',                                      'µg/dL',  NULL, NULL, '8 AM: 6.2–19.4 µg/dL; 4 PM: 2.3–11.9 µg/dL'),
  ('Cholinesterase',                                'U/L',    NULL, NULL, 'Method-dependent: about 4,000–12,000 U/L in adults — check your kit''s insert'),
  ('Absolute Eosinophil Count (AEC)',               'cells/µL', 20, 500,  '20–500 cells/µL'),
  ('Congenital Hypothyroid Screen',                 'mIU/L',  NULL, 20,   'TSH < 20 mIU/L (day 3–5)'),
  ('Inhibin B',                                     'pg/mL',  NULL, NULL, 'Depends on age, sex and cycle phase — read with the kit''s reference'),
  ('Small Dense LDL (sdLDL)',                       'mg/dL',  NULL, NULL, 'No single cut-off; lower is better — read with LDL cholesterol'),
  ('Platelet Function Analyser (PFA-100)',          'seconds',NULL, NULL, 'Collagen/Epinephrine 82–150 s; Collagen/ADP 62–100 s'),
  ('Urine Sodium (Spot)',                           'mmol/L', NULL, NULL, 'No fixed normal range — read with fluid intake and clinical state'),
  ('Urine Potassium (Spot)',                        'mmol/L', NULL, NULL, 'No fixed normal range — read with intake and clinical state'),
  ('Synovial Fluid Uric Acid',                      'mg/dL',  NULL, NULL, 'No fixed normal range — compare with serum uric acid'),
  ('HBV DNA – Quantitative',                        'IU/mL',  NULL, NULL, 'Not detected'),
  ('IGRA – TB (Interferon Gamma Release Assay)',    'IU/mL',  NULL, NULL, 'Negative (TB antigen minus Nil < 0.35 IU/mL)'),
  -- Infection screens: the normal is a word
  ('Malaria Parasite Antigen (Rapid Card)',         NULL, NULL, NULL, 'Negative'),
  ('Plasmodium falciparum Antigen',                 NULL, NULL, NULL, 'Negative'),
  ('Plasmodium vivax Antigen',                      NULL, NULL, NULL, 'Negative'),
  ('Dengue NS1',                                    NULL, NULL, NULL, 'Not detected'),
  ('Dengue Antibody IgG and IgM',                   NULL, NULL, NULL, 'Negative (IgG and IgM)'),
  ('Dengue IgG',                                    NULL, NULL, NULL, 'Negative'),
  ('Scrub Typhus Antibody IgG and IgM',             NULL, NULL, NULL, 'Negative (IgG and IgM)'),
  ('Typhidot IgM (S. typhi OMP antibody)',          NULL, NULL, NULL, 'Negative'),
  ('HIV 1 and 2 Antibody',                          NULL, NULL, NULL, 'Non-reactive'),
  ('COVID-19',                                      NULL, NULL, NULL, 'Not detected'),
  ('COVID-19 IgG Antibody',                         NULL, NULL, NULL, 'Negative (positive = past infection or vaccination)'),
  ('Mycoplasma pneumoniae IgG',                     NULL, NULL, NULL, 'Negative'),
  ('Chlamydia IgG',                                 NULL, NULL, NULL, 'Negative'),
  ('HSV 1 & 2 IgG',                                 NULL, NULL, NULL, 'Negative (positive = past infection)'),
  ('CMV IgG',                                       NULL, NULL, NULL, 'Negative (positive = past infection)'),
  ('EBV VCA IgG',                                   NULL, NULL, NULL, 'Negative (positive = past or recent infection)'),
  ('EBV EBNA IgG (Past Infection)',                 NULL, NULL, NULL, 'Negative (positive = past infection)'),
  ('TORCH Panel IgG',                               NULL, NULL, NULL, 'Negative (positive = past infection or immunity)'),
  ('Toxoplasma IgG',                                NULL, NULL, NULL, 'Negative (positive = past infection or immunity)'),
  ('HAV IgG (Hepatitis A)',                         NULL, NULL, NULL, 'Negative (positive = past infection or immunity)'),
  ('Anti-HBe',                                      NULL, NULL, NULL, 'Negative'),
  ('Hepatitis B Panel (Full)',                      NULL, NULL, NULL, 'All markers negative'),
  ('CBNAAT (Cartridge Based Nucleic Acid Amplification Test)', NULL, NULL, NULL, 'MTB not detected'),
  ('Direct Coombs Test (DCT)',                      NULL, NULL, NULL, 'Negative'),
  ('Stool Occult Blood',                            NULL, NULL, NULL, 'Negative'),
  ('Urine Pregnancy Test (UPT)',                    NULL, NULL, NULL, 'Negative (not pregnant)'),
  ('Urine Porphyrins',                              NULL, NULL, NULL, 'Negative (qualitative screen)'),
  ('Anti-GAD Antibody (Glutamic Acid Decarboxylase)', NULL, NULL, NULL, 'Negative (below the kit cut-off)'),
  ('ANA / ENA Profile',                             NULL, NULL, NULL, 'Negative for all antigens'),
  ('Anti-Phospholipid Syndrome Panel',              NULL, NULL, NULL, 'Negative for all antibodies'),
  -- Smears, cultures and cytology
  ('Sputum AFB Smear',                              NULL, NULL, NULL, 'No AFB seen'),
  ('Pleural Fluid AFB Smear',                       NULL, NULL, NULL, 'No AFB seen'),
  ('Bronchoalveolar Lavage AFB Smear',              NULL, NULL, NULL, 'No AFB seen'),
  ('Bronchoalveolar Lavage Modified AFB Stain (Nocardia)', NULL, NULL, NULL, 'No acid-fast organisms seen'),
  ('Bronchoalveolar Lavage KOH Mount for Fungus',   NULL, NULL, NULL, 'No fungal elements seen'),
  ('Pleural Fluid Gram Stain',                      NULL, NULL, NULL, 'No organisms seen'),
  ('BAL AFB Culture',                               NULL, NULL, NULL, 'No growth after 8 weeks'),
  ('Blood Culture and Sensitivity',                 NULL, NULL, NULL, 'No growth after 5 days'),
  ('Urine Culture and Sensitivity',                 NULL, NULL, NULL, 'No significant growth (< 10,000 CFU/mL)'),
  ('Sputum Culture and Sensitivity',                NULL, NULL, NULL, 'Normal respiratory flora or no growth'),
  ('Pleural Fluid Culture and Sensitivity',         NULL, NULL, NULL, 'No growth'),
  ('BAL Culture & Sensitivity',                     NULL, NULL, NULL, 'No growth or normal flora'),
  ('Urethral Swab Culture & Sensitivity',           NULL, NULL, NULL, 'No pathogen isolated'),
  ('Bronchoalveolar Lavage Cytology',               NULL, NULL, NULL, 'No malignant cells'),
  ('Pap Smear (Cervical Cytology)',                 NULL, NULL, NULL, 'Negative for intraepithelial lesion or malignancy (NILM)'),
  ('Pleural Fluid Routine Analysis',                NULL, NULL, NULL, 'Clear, pale yellow; cells < 1,000/µL; protein < 3 g/dL'),
  ('Ascitic Fluid Routine Analysis',                NULL, NULL, NULL, 'Clear, straw-coloured; neutrophils < 250/µL'),
  ('Pericardial Fluid Analysis',                    NULL, NULL, NULL, 'Clear, pale yellow — descriptive report'),
  -- Reports that describe rather than measure
  ('Quadruple Marker Screen',                       NULL, NULL, NULL, 'Screen negative (low risk)'),
  ('Triple Marker',                                 NULL, NULL, NULL, 'Screen negative (low risk)'),
  ('Double Marker Screen',                          NULL, NULL, NULL, 'Screen negative (low risk)'),
  ('Chromosomal Microarray (CMA)',                  NULL, NULL, NULL, 'No pathogenic copy-number change detected'),
  ('EGFR Mutation Analysis',                        NULL, NULL, NULL, 'No mutation detected'),
  ('Fluorescence In-Situ Hybridisation (FISH)',     NULL, NULL, NULL, 'No abnormality detected'),
  ('Next Generation Sequencing (NGS) Panel',        NULL, NULL, NULL, 'No pathogenic variant detected'),
  ('HLA Typing',                                    NULL, NULL, NULL, 'HLA alleles reported — no normal range'),
  ('Sensitivity Testing (MIC)',                     NULL, NULL, NULL, 'MIC and interpretation per antibiotic — no normal range'),
  ('Anti-TB Drug Sensitivity Testing',              NULL, NULL, NULL, 'Sensitive or resistant per drug — no normal range'),
  ('Transbronchial Lung Biopsy (TBLB)',             NULL, NULL, NULL, 'Descriptive histopathology report — no normal range'),
  ('Blood Group and Rh Typing',                     NULL, NULL, NULL, 'ABO group and Rh (D) type — no normal range'),
  ('Blood Group & Rh Factor',                       NULL, NULL, NULL, 'ABO group and Rh (D) type — no normal range'),
  ('ABO Blood Grouping',                            NULL, NULL, NULL, 'Reported as A, B, AB or O — no normal range'),
  ('Rh Typing',                                     NULL, NULL, NULL, 'Reported as Rh (D) positive or negative — no normal range')
)
UPDATE lab_tests_master m
   SET unit            = COALESCE(m.unit, v.unit),
       ref_low         = v.lo,
       ref_high        = v.hi,
       reference_range = v.txt
  FROM v
 WHERE m.name = v.name
   AND m.ref_low IS NULL AND m.ref_high IS NULL
   AND (m.reference_range IS NULL OR btrim(m.reference_range) = '');

-- ── 3. Not laboratory tests ─────────────────────────────────────────────────
-- An ultrasound, a sonosalpingogram and a cardiotocogram were added to the lab
-- master list when a hospital's old list was imported. They are scans and
-- monitoring, priced and reported in Radiology. Switched off in the MASTER
-- only, so no new hospital adds them as lab tests; a hospital that already has
-- one keeps its own copy until it moves it.
UPDATE lab_tests_master SET is_active = false
 WHERE name IN ('Ultrasound Scan (unspecified)', 'Sonosalpingography (SSG)', 'Cardiotocography (CTG)')
   AND is_active;

COMMIT;
