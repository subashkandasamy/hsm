-- 0278 — Codes from a known analyzer map themselves, at every hospital.
--
-- Asked for at Karur, 9 Nov 2026, after connecting four machines: every code
-- from every analyzer had to be matched to a measurement by hand, at every
-- hospital, and many could not be matched at all. Three causes:
--
--   1. Uyirly's measurement list had no blood gas, clotting, troponin or
--      total T3/T4 measurements — PT, APTT, INR, pH, pO2, lactate… had
--      nothing to map to, at any hospital.
--   2. The shared machine library (0184) existed but held one unchecked
--      machine nobody uses, so no hospital's analyzer was ever recognised.
--   3. (In code) the suggestion word list pointed at codes that do not exist.
--
-- This adds the measurements, links them to the tests that report them, and
-- fills the library with the four machines read at Karur on 9 Nov 2026.
--
-- Only tests nobody has ordered yet are linked (checked before applying: all
-- are in Karur's catalogue, none has an order), so no past result changes
-- shape. The standard ranges below match the ranges those tests already
-- carried, so nothing that flagged before stops flagging.

-- ── 1. Measurements ─────────────────────────────────────────────────────────
INSERT INTO lab_analytes (id, code, name, short_name, unit_ucum, decimals, value_type) VALUES
  -- Clotting (Erba ECL 105)
  (gen_random_uuid(), 'PT_SEC',   'Prothrombin Time',                      'PT',              's',      1, 'numeric'),
  (gen_random_uuid(), 'INR',      'International Normalised Ratio',        'INR',             NULL,     2, 'numeric'),
  (gen_random_uuid(), 'APTT_SEC', 'Activated Partial Thromboplastin Time', 'aPTT',            's',      1, 'numeric'),
  (gen_random_uuid(), 'FIB',      'Fibrinogen',                            'Fibrinogen',      'mg/dL',  0, 'numeric'),
  -- Immunoassay (Boditech iChroma II)
  (gen_random_uuid(), 'TROP_I',   'Troponin I',                            'Troponin I',      'ng/mL',  3, 'numeric'),
  (gen_random_uuid(), 'T3',       'Total T3 (Triiodothyronine)',           'T3',              'ng/dL',  0, 'numeric'),
  (gen_random_uuid(), 'T4',       'Total T4 (Thyroxine)',                  'T4',              'ug/dL',  1, 'numeric'),
  -- Blood gas (EDAN i15). Blood-gas-only codes where a lab already has the
  -- same word for another sample: urine pH, CBC haematocrit and haemoglobin,
  -- fasting/random glucose. Sharing them would put a blood gas haematocrit
  -- on the CBC of a patient who had both.
  (gen_random_uuid(), 'BG_PH',    'pH (blood gas)',                        'pH',              NULL,     2, 'numeric'),
  (gen_random_uuid(), 'PCO2',     'pCO2',                                  'pCO2',            'mmHg'  , 1, 'numeric'),
  (gen_random_uuid(), 'PO2',      'pO2',                                   'pO2',             'mmHg'  , 0, 'numeric'),
  (gen_random_uuid(), 'HCO3',     'Bicarbonate (actual)',                  'HCO3 (actual)',   'mmol/L', 1, 'numeric'),
  (gen_random_uuid(), 'HCO3_STD', 'Bicarbonate (standard)',                'HCO3 (standard)', 'mmol/L', 1, 'numeric'),
  (gen_random_uuid(), 'BE_ECF',   'Base Excess (extracellular fluid)',     'BE (ecf)',        'mmol/L', 1, 'numeric'),
  (gen_random_uuid(), 'BE_B',     'Base Excess (blood)',                   'BE (B)',          'mmol/L', 1, 'numeric'),
  (gen_random_uuid(), 'TCO2',     'Total CO2',                             'tCO2',            'mmol/L', 0, 'numeric'),
  (gen_random_uuid(), 'SO2',      'Oxygen Saturation',                     'sO2',             '%',      0, 'numeric'),
  (gen_random_uuid(), 'BG_THB',   'Haemoglobin (blood gas)',               'tHb',             'g/dL',   1, 'numeric'),
  (gen_random_uuid(), 'BG_HCT',   'Haematocrit (blood gas)',               'Hct',             '%',      0, 'numeric'),
  (gen_random_uuid(), 'BG_GLU',   'Glucose (blood gas)',                   'Glucose',         'mg/dL',  0, 'numeric'),
  (gen_random_uuid(), 'LACT',     'Lactate',                               'Lactate',         'mmol/L', 2, 'numeric'),
  (gen_random_uuid(), 'ICA',      'Ionised Calcium',                       'Ionised Calcium', 'mmol/L', 2, 'numeric'),
  (gen_random_uuid(), 'AGAP',     'Anion Gap',                             'Anion Gap',       'mmol/L', 0, 'numeric'),
  (gen_random_uuid(), 'OSMO',     'Osmolarity (calculated)',               'Osmolarity',      'mOsm/L', 1, 'numeric')
ON CONFLICT (code) DO NOTHING;

-- Adult ranges, the same as those tests carried. A hospital's own range, or
-- the one its analyzer sends, takes precedence (resolve_reference_range).
-- pO2, sO2, haemoglobin, haematocrit and glucose are left without one: they
-- depend on the sample (arterial or venous), sex, or fasting.
INSERT INTO lab_reference_ranges (id, tenant_id, analyte_id, sex, age_min_days, age_max_days, ref_low, ref_high, source, source_note)
SELECT gen_random_uuid(), NULL, a.id, 'any', 0, 54750, v.lo, v.hi, 'uyirly_standard', 'Adult reference interval — set your own in lab settings'
  FROM (VALUES
    ('PT_SEC', 11::numeric, 13.5::numeric), ('INR', 0.8, 1.2), ('APTT_SEC', 25, 35), ('FIB', 200, 400),
    ('TROP_I', NULL, 0.04), ('T3', 80, 200), ('T4', 5.0, 12.0),
    ('BG_PH', 7.35, 7.45), ('PCO2', 35, 45), ('HCO3', 22, 26), ('HCO3_STD', 22, 26),
    ('BE_ECF', -2, 2), ('BE_B', -2, 2), ('TCO2', 23, 29), ('LACT', 0.5, 2.2),
    ('ICA', 1.16, 1.32), ('AGAP', 8, 16), ('OSMO', 275, 295)
  ) AS v(code, lo, hi)
  JOIN lab_analytes a ON a.code = v.code
 WHERE NOT EXISTS (SELECT 1 FROM lab_reference_ranges r
                    WHERE r.analyte_id = a.id AND r.tenant_id IS NULL);

-- ── 2. Which test reports which measurement ─────────────────────────────────
-- Masters by id: they are global, and two share a name with a different code.
INSERT INTO lab_test_analytes (id, lab_master_id, analyte_id, display_order)
SELECT gen_random_uuid(), v.master::uuid, a.id, v.ord
  FROM (VALUES
    ('a141d9af-4865-4cb1-813e-9715e4aa29ee', 'PT_SEC', 1),    -- Prothrombin Time (PT)
    ('874b8273-13cb-481d-afd5-0af917874582', 'INR', 1),       -- INR
    ('e4984c62-5007-49ab-9b55-51d1a30e5862', 'APTT_SEC', 1),  -- aPTT
    ('cab036b0-cc43-4f35-b86e-fc150e6772ec', 'FIB', 1),       -- Fibrinogen
    ('59969c67-c37d-44c1-a9f8-00d5bdee0fcd', 'FIB', 1),       -- Plasma Fibrinogen
    ('9f639098-24fb-4977-b708-a2c9568c3b08', 'TROP_I', 1),    -- Troponin I (High Sensitivity)
    ('a4e243e6-eba7-4f87-9676-3a6523176862', 'T3', 1),        -- Total T3
    ('df548aec-de14-498c-ae17-21bae426ac9d', 'T3', 1),        -- Triiodothyronine (T3)
    ('a890bd4a-fd4c-4d01-9bb9-589980358144', 'T4', 1),        -- Total T4
    ('ed3690e3-5741-44c3-a204-d6297baf152e', 'T4', 1),        -- Thyroxine (T4)
    ('bf4fc0ba-e549-43ce-8022-b1eb69a0b2e6', 'FT3', 1),       -- Free T3
    ('0f048af2-7b0a-4e5f-800b-94b8445794a5', 'FT4', 1),       -- Free T4
    ('642acf04-f0ae-4474-ba40-db68cfeb03c5', 'FT3', 1),       -- Free Thyroid Profile
    ('642acf04-f0ae-4474-ba40-db68cfeb03c5', 'FT4', 2),
    ('642acf04-f0ae-4474-ba40-db68cfeb03c5', 'TSH', 3),
    ('949d8dc7-1ee6-4090-bbfd-ad629f6de350', 'LACT', 1),      -- Lactate
    ('354e5081-68c8-466c-92ee-a5a9e0e44426', 'ICA', 1),       -- Ionised Calcium
    ('a618c60e-6767-4d16-952a-3bfe670bbdd7', 'ICA', 1),       -- Ionized Calcium
    ('699ca9c1-6c44-4994-a28c-5efcc503c360', 'NA', 1),        -- Electrolytes
    ('699ca9c1-6c44-4994-a28c-5efcc503c360', 'K', 2),
    ('699ca9c1-6c44-4994-a28c-5efcc503c360', 'CL', 3),
    -- Blood Gas – Blood Gas Values / Acid-Base / Electrolytes / Metabolites / Oximetry
    ('b40fa16e-9043-4bbb-9a47-ffccecc7d59e', 'BG_PH', 1), ('b40fa16e-9043-4bbb-9a47-ffccecc7d59e', 'PCO2', 2),
    ('b40fa16e-9043-4bbb-9a47-ffccecc7d59e', 'PO2', 3),
    ('c342aec8-70c4-4b0e-a634-5696e7f71a22', 'HCO3', 1), ('c342aec8-70c4-4b0e-a634-5696e7f71a22', 'HCO3_STD', 2),
    ('c342aec8-70c4-4b0e-a634-5696e7f71a22', 'BE_ECF', 3), ('c342aec8-70c4-4b0e-a634-5696e7f71a22', 'BE_B', 4),
    ('c342aec8-70c4-4b0e-a634-5696e7f71a22', 'TCO2', 5), ('c342aec8-70c4-4b0e-a634-5696e7f71a22', 'AGAP', 6),
    ('1c644423-a59b-4dc9-a5b9-1e92bce95fdb', 'NA', 1), ('1c644423-a59b-4dc9-a5b9-1e92bce95fdb', 'K', 2),
    ('1c644423-a59b-4dc9-a5b9-1e92bce95fdb', 'CL', 3), ('1c644423-a59b-4dc9-a5b9-1e92bce95fdb', 'ICA', 4),
    ('b80f4074-4f90-48f7-ab12-f1bfdb57eb9f', 'BG_GLU', 1), ('b80f4074-4f90-48f7-ab12-f1bfdb57eb9f', 'LACT', 2),
    ('4741f054-7f96-4055-a744-be9c307101cb', 'BG_THB', 1), ('4741f054-7f96-4055-a744-be9c307101cb', 'SO2', 2),
    ('4741f054-7f96-4055-a744-be9c307101cb', 'BG_HCT', 3)
  ) AS v(master, code, ord)
  JOIN lab_analytes a ON a.code = v.code
 WHERE NOT EXISTS (SELECT 1 FROM lab_test_analytes x WHERE x.lab_master_id = v.master::uuid AND x.analyte_id = a.id);

-- ABG / VBG with lactate, and the full ABG with electrolytes and glucose.
INSERT INTO lab_test_analytes (id, lab_master_id, analyte_id, display_order)
SELECT gen_random_uuid(), m.master::uuid, a.id, c.ord
  FROM (VALUES ('3c20c9a5-a08f-44d3-9a45-28af1a8c36aa', false),   -- ABG with Lactate
               ('e1b741ed-291b-4577-887a-9038b3480d1f', false),   -- VBG with Lactate
               ('4fa6844f-b33c-4e92-a620-22c34f55aac0', true))    -- ABG + Lactate, Electrolytes, Glucose
       AS m(master, full_panel)
  CROSS JOIN (VALUES
    ('BG_PH', 1, false), ('PCO2', 2, false), ('PO2', 3, false), ('HCO3', 4, false),
    ('HCO3_STD', 5, false), ('BE_ECF', 6, false), ('BE_B', 7, false), ('TCO2', 8, false),
    ('SO2', 9, false), ('LACT', 10, false),
    ('NA', 11, true), ('K', 12, true), ('CL', 13, true), ('ICA', 14, true), ('BG_GLU', 15, true),
    ('BG_HCT', 16, true), ('BG_THB', 17, true), ('AGAP', 18, true), ('OSMO', 19, true)
  ) AS c(code, ord, full_only)
  JOIN lab_analytes a ON a.code = c.code
 WHERE (m.full_panel OR NOT c.full_only)
   AND NOT EXISTS (SELECT 1 FROM lab_test_analytes x WHERE x.lab_master_id = m.master::uuid AND x.analyte_id = a.id);

-- ── 3. The machine library ──────────────────────────────────────────────────
-- A library row may now say "this code is not a measurement" (a ratio the
-- machine always sends as 0.0, a temperature-corrected duplicate), so a new
-- hospital is not asked about it either.
ALTER TABLE device_library_codes ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
ALTER TABLE device_library_codes ALTER COLUMN analyte_id DROP NOT NULL;
ALTER TABLE device_library_codes DROP CONSTRAINT IF EXISTS device_library_codes_meaning;
ALTER TABLE device_library_codes ADD CONSTRAINT device_library_codes_meaning
  CHECK (analyte_id IS NOT NULL OR NOT enabled);

-- Fingerprints exactly as these machines name themselves (what ingest stores).
INSERT INTO device_library (id, fingerprint, manufacturer, model, protocol, framing, default_port, notes, verified_at) VALUES
  (gen_random_uuid(), 'H360^Erba',  'Erba',     'H360',       'hl7',  'framed', 5150, '3-part haematology. Read at Karur, 9 Nov 2026.', now()),
  (gen_random_uuid(), 'ECL 105',    'Erba',     'ECL 105',    'astm', 'framed', 5150, 'Coagulation. Sends three results per test (seconds, ratio, INR/%). Read at Karur, 9 Nov 2026.', now()),
  (gen_random_uuid(), '1^ichroma2', 'Boditech', 'iChroma II', 'hl7',  'framed', 5150, 'Immunoassay. Sample id in PID-2. Read at Karur, 9 Nov 2026.', now()),
  (gen_random_uuid(), 'EDAN^i15',   'EDAN',     'i15',        'hl7',  'framed', 5150, 'Blood gas. Name in OBX-4. Read at Karur, 9 Nov 2026.', now())
ON CONFLICT (fingerprint) DO NOTHING;

-- unit = what the machine sends (ingest refuses a result whose unit differs,
-- so a factor can never be applied to the wrong unit). factor converts it.
INSERT INTO device_library_codes (id, device_library_id, analyzer_code, analyte_id, unit_ucum, factor, enabled)
SELECT gen_random_uuid(), l.id, v.code, a.id, v.unit, v.factor, a.id IS NOT NULL
  FROM (VALUES
    -- Erba H360, as confirmed on the demo hospital
    ('H360^Erba', 'WBC', 'WBC', '10*3/uL', NULL::numeric), ('H360^Erba', 'RBC', 'RBC', '10*6/uL', NULL),
    ('H360^Erba', 'HGB', 'HGB', 'g/dL', NULL), ('H360^Erba', 'HCT', 'HCT', '%', NULL),
    ('H360^Erba', 'MCV', 'MCV', 'fL', NULL), ('H360^Erba', 'MCH', 'MCH', 'pg', NULL),
    ('H360^Erba', 'MCHC', 'MCHC', 'g/dL', NULL), ('H360^Erba', 'PLT', 'PLT', '10*3/uL', NULL),
    ('H360^Erba', 'MPV', 'MPV', 'fL', NULL), ('H360^Erba', 'PCT', 'PCT', '%', NULL),
    ('H360^Erba', 'PDW-CV', 'PDW_CV', '%', NULL), ('H360^Erba', 'PDW-SD', 'PDW_SD', 'fL', NULL),
    ('H360^Erba', 'P-LCC', 'P_LCC', '10*3/uL', NULL), ('H360^Erba', 'P-LCR', 'P_LCR', '%', NULL),
    ('H360^Erba', 'RDW-CV', 'RDW_CV', '%', NULL), ('H360^Erba', 'RDW-SD', 'RDW_SD', 'fL', NULL),
    ('H360^Erba', 'LYM#', 'LYMPH_ABS', '10*3/uL', NULL), ('H360^Erba', 'LYM%', 'LYMPH_PCT', '%', NULL),
    ('H360^Erba', 'GRAN#', 'NEUT_ABS', '10*3/uL', NULL), ('H360^Erba', 'GRAN%', 'NEUT_PCT', '%', NULL),
    ('H360^Erba', 'MID#', 'MONO_ABS', '10*3/uL', NULL), ('H360^Erba', 'MID%', 'MONO_PCT', '%', NULL),
    ('H360^Erba', '*Mentzr', 'MENTZER', NULL, NULL), ('H360^Erba', '*RDWI', 'RDWI', NULL, NULL),
    ('H360^Erba', 'Age', NULL, 'yr', NULL), ('H360^Erba', '02001', NULL, NULL, NULL),
    ('H360^Erba', '02002', NULL, NULL, NULL), ('H360^Erba', '02003', NULL, NULL, NULL),
    ('H360^Erba', '03001', NULL, NULL, NULL), ('H360^Erba', '13101', NULL, NULL, NULL),
    ('H360^Erba', '13110', NULL, NULL, NULL), ('H360^Erba', '13302', NULL, NULL, NULL),
    -- Erba ECL 105: the seconds and INR are the results; ratio, "no unit"
    -- and % arrive as 0.0 or duplicates.
    ('ECL 105', 'APTT', 'APTT_SEC', 'Sec', NULL), ('ECL 105', 'APTT (Ratio)', NULL, 'Ratio', NULL),
    ('ECL 105', 'APTT (No Unit)', NULL, 'No Unit', NULL),
    ('ECL 105', 'PT (Sec)', 'PT_SEC', 'Sec', NULL), ('ECL 105', 'PT (INR)', 'INR', 'INR', NULL),
    ('ECL 105', 'PT', NULL, '%', NULL),
    ('ECL 105', 'PT LS (Sec)', 'PT_SEC', 'Sec', NULL), ('ECL 105', 'PT LS (INR)', 'INR', 'INR', NULL),
    ('ECL 105', 'PT LS', NULL, '%', NULL),
    -- Boditech iChroma II. T4 arrives in nmol/L: 1 µg/dL = 12.87 nmol/L.
    ('1^ichroma2', 'Tn-I', 'TROP_I', 'ng/mL', NULL), ('1^ichroma2', 'T4', 'T4', 'nmol/L', 0.0777),
    -- EDAN i15. Temperature-corrected (T) values, FiO2-derived indices and
    -- the operator's entries are not separate measurements.
    ('EDAN^i15', 'pH', 'BG_PH', NULL, NULL), ('EDAN^i15', 'pCO2', 'PCO2', 'mmHg', NULL),
    ('EDAN^i15', 'pO2', 'PO2', 'mmHg', NULL), ('EDAN^i15', 'Na+', 'NA', 'mmol/L', NULL),
    ('EDAN^i15', 'K+', 'K', 'mmol/L', NULL), ('EDAN^i15', 'Cl-', 'CL', 'mmol/L', NULL),
    ('EDAN^i15', 'Ca++', 'ICA', 'mmol/L', NULL), ('EDAN^i15', 'Glu', 'BG_GLU', 'mg/dL', NULL),
    ('EDAN^i15', 'Lac', 'LACT', 'mmol/L', NULL), ('EDAN^i15', 'Hct', 'BG_HCT', '%', NULL),
    ('EDAN^i15', 'tHb(est)', 'BG_THB', 'g/dL', NULL), ('EDAN^i15', 'HCO3-act', 'HCO3', 'mmol/L', NULL),
    ('EDAN^i15', 'HCO3-std', 'HCO3_STD', 'mmol/L', NULL), ('EDAN^i15', 'BE(ecf)', 'BE_ECF', 'mmol/L', NULL),
    ('EDAN^i15', 'BE(B)', 'BE_B', 'mmol/L', NULL), ('EDAN^i15', 'ctCO2', 'TCO2', 'mmol/L', NULL),
    ('EDAN^i15', 'sO2(est)', 'SO2', '%', NULL), ('EDAN^i15', 'AnGap', 'AGAP', 'mmol/L', NULL),
    ('EDAN^i15', 'mOsm', 'OSMO', 'mOsm/L', NULL),
    ('EDAN^i15', 'cH+', NULL, 'nmol/L', NULL), ('EDAN^i15', 'cH+(T)', NULL, 'nmol/L', NULL),
    ('EDAN^i15', 'pH(T)', NULL, NULL, NULL), ('EDAN^i15', 'pCO2(T)', NULL, 'mmHg', NULL),
    ('EDAN^i15', 'pO2(T)', NULL, 'mmHg', NULL), ('EDAN^i15', 'BB(B)', NULL, 'mmol/L', NULL),
    ('EDAN^i15', 'Ca++(7.4)', NULL, 'mmol/L', NULL), ('EDAN^i15', 'Temperature', NULL, '°C', NULL),
    ('EDAN^i15', 'FIO2', NULL, '%', NULL), ('EDAN^i15', 'pO2(A-a)', NULL, 'mmHg', NULL),
    ('EDAN^i15', 'pO2(a/A)', NULL, NULL, NULL), ('EDAN^i15', 'RI', NULL, NULL, NULL),
    ('EDAN^i15', 'pO2/FIO2', NULL, 'mmHg', NULL), ('EDAN^i15', 'pO2(A-a)(T)', NULL, 'mmHg', NULL),
    ('EDAN^i15', 'pO2(a/A)(T)', NULL, NULL, NULL), ('EDAN^i15', 'RI(T)', NULL, NULL, NULL),
    ('EDAN^i15', 'pO2(T)/FIO2', NULL, 'mmHg', NULL)
  ) AS v(fingerprint, code, analyte, unit, factor)
  JOIN device_library l ON l.fingerprint = v.fingerprint
  LEFT JOIN lab_analytes a ON a.code = v.analyte
ON CONFLICT (device_library_id, analyzer_code) DO NOTHING;
