-- Every panel grouped the way its analyzer reports it. Singles stay single.
--
-- CBC was the first. The same damage was sitting in every other panel:
--   "Thyroid Profile (T3 T4 TSH)" carried unit mIU/L and range 0.4-4.0 — TSH's
--   — applied to a panel that also holds T3 in ng/dL and T4 in µg/dL.
--   "Liver Function Test" was one box marked U/L for ten measurements in four
--   different units, with no range at all.
--
-- Tests that really are one measurement — haemoglobin on its own, random blood
-- sugar, serum creatinine — are left exactly as they are. They do not need a
-- panel, only a link to their analyte so they inherit a sex- and age-aware
-- range. Grouping a single test would be ceremony for its own sake.
--
-- ── Where the biochemistry ranges come from ─────────────────────────────────
--
-- Not from me. lab_tests_master already ships a unit and a reference range for
-- every one of these analytes, reviewed when that catalogue was built, and
-- those are promoted into the analyte dictionary with their provenance
-- recorded. That is real documentation under NABL 112 §5.7, where inventing
-- numbers would not be.

-- ── Analytes are not all numbers ────────────────────────────────────────────
--
-- A urine strip does not report a number for protein. It reports Negative,
-- Trace, 1+, 2+, 3+ — an ordered scale — and "normal" is a set of acceptable
-- values rather than a low and a high. Colour is free text. Modelling those as
-- numerics with a range is how urinalysis gets mangled into a single sentence.

ALTER TABLE lab_analytes
  ADD COLUMN IF NOT EXISTS value_type     text NOT NULL DEFAULT 'numeric',
  ADD COLUMN IF NOT EXISTS allowed_values text[],   -- ordered, worst last
  ADD COLUMN IF NOT EXISTS normal_values  text[];   -- which of those are normal

ALTER TABLE lab_analytes DROP CONSTRAINT IF EXISTS lab_analytes_value_type_check;
ALTER TABLE lab_analytes ADD CONSTRAINT lab_analytes_value_type_check
  CHECK (value_type = ANY (ARRAY['numeric','ordinal','text']));

COMMENT ON COLUMN lab_analytes.allowed_values IS
  'For an ordinal analyte, the scale in order — {Negative,Trace,1+,2+,3+}. The screen offers exactly these, so a strip result cannot be typed as free text.';

-- ── Promote the biochemistry analytes out of the shared catalogue ───────────
--
-- Selected by (code, name) rather than code alone: TG is Triglycerides in mg/dL
-- and Thyroglobulin in ng/mL, and picking by code would give the lipid panel
-- a thyroid tumour marker.

INSERT INTO lab_analytes (id, code, name, short_name, unit_ucum, decimals, value_type)
SELECT gen_random_uuid(), x.analyte_code, m.name, x.short, m.unit, x.dp, 'numeric'
  FROM (VALUES
    -- Liver
    ('TBIL','Total Bilirubin','Bilirubin (Total)',2),
    ('DBIL','Direct Bilirubin','Bilirubin (Direct)',2),
    ('IBIL','Indirect Bilirubin','Bilirubin (Indirect)',2),
    ('SGOT','SGOT / AST','SGOT (AST)',0),
    ('SGPT','SGPT / ALT','SGPT (ALT)',0),
    ('ALP','Alkaline Phosphatase (ALP)','ALP',0),
    ('TP','Total Protein','Total Protein',1),
    ('ALB','Albumin','Albumin',1),
    ('GLOB','Globulin','Globulin',1),
    -- Kidney
    ('UREA','Blood Urea','Urea',0),
    ('BUN','Blood Urea Nitrogen (BUN)','BUN',0),
    ('CREAT','Serum Creatinine','Creatinine',2),
    ('UA','Serum Uric Acid','Uric Acid',1),
    ('NA','Serum Sodium','Sodium',0),
    ('K','Serum Potassium','Potassium',1),
    ('CL','Serum Chloride','Chloride',0),
    -- Lipids
    ('TC','Total Cholesterol','Total Cholesterol',0),
    ('TRIG','Triglycerides','Triglycerides',0),
    ('HDL','HDL Cholesterol','HDL',0),
    ('LDL','LDL Cholesterol','LDL',0),
    -- Thyroid
    ('TSH','TSH (Thyroid Stimulating Hormone)','TSH',2),
    ('FT3','Free T3','Free T3',2),
    ('FT4','Free T4','Free T4',2),
    -- Sugars, used as singles but worth having as analytes
    ('FBG','Fasting Blood Glucose','Fasting Glucose',0),
    ('PPBG','Post-Prandial Blood Glucose (2h)','Post-Prandial Glucose',0),
    ('RBSG','Random Blood Sugar','Random Blood Sugar',0),
    ('HBA1C','HbA1c (Glycated Haemoglobin)','HbA1c',1)
  ) AS x(analyte_code, master_name, short, dp)
  JOIN lab_tests_master m ON m.name = x.master_name
ON CONFLICT (code) DO NOTHING;

-- Their ranges, carried over with their provenance.
INSERT INTO lab_reference_ranges
  (id, tenant_id, analyte_id, sex, age_min_days, age_max_days, ref_low, ref_high, source, source_note)
SELECT gen_random_uuid(), NULL, a.id, 'any', 0, 54750, m.ref_low, m.ref_high, 'uyirly_standard',
       'Uyirly shared test catalogue (lab_tests_master), promoted to the analyte dictionary'
  FROM lab_analytes a
  JOIN (VALUES
    ('TBIL','Total Bilirubin'),('DBIL','Direct Bilirubin'),('IBIL','Indirect Bilirubin'),
    ('SGOT','SGOT / AST'),('SGPT','SGPT / ALT'),('ALP','Alkaline Phosphatase (ALP)'),
    ('TP','Total Protein'),('ALB','Albumin'),('GLOB','Globulin'),
    ('UREA','Blood Urea'),('BUN','Blood Urea Nitrogen (BUN)'),('CREAT','Serum Creatinine'),
    ('UA','Serum Uric Acid'),('NA','Serum Sodium'),('K','Serum Potassium'),('CL','Serum Chloride'),
    ('TC','Total Cholesterol'),('TRIG','Triglycerides'),('HDL','HDL Cholesterol'),('LDL','LDL Cholesterol'),
    ('TSH','TSH (Thyroid Stimulating Hormone)'),('FT3','Free T3'),('FT4','Free T4'),
    ('FBG','Fasting Blood Glucose'),('PPBG','Post-Prandial Blood Glucose (2h)'),
    ('RBSG','Random Blood Sugar'),('HBA1C','HbA1c (Glycated Haemoglobin)')
  ) AS x(analyte_code, master_name) ON x.analyte_code = a.code
  JOIN lab_tests_master m ON m.name = x.master_name
 WHERE (m.ref_low IS NOT NULL OR m.ref_high IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM lab_reference_ranges r
                    WHERE r.analyte_id = a.id AND r.tenant_id IS NULL AND r.sex = 'any');

-- ── Urine, exactly as the strip and the microscope report it ────────────────
--
-- A standard ten-pad strip reads glucose, bilirubin, ketone, specific gravity,
-- blood, pH, protein, urobilinogen, nitrite and leucocytes. Eight of those come
-- back on an ordered scale, two as numbers. Microscopy is counted per
-- high-power field and written the way a technician writes it — "2-3", "plenty"
-- — so it stays text rather than being forced into a number it is not.

INSERT INTO lab_analytes (id, code, name, short_name, unit_ucum, decimals, value_type, allowed_values, normal_values) VALUES
  (gen_random_uuid(),'UR_COLOUR','Colour','Colour',NULL,0,'text',NULL,NULL),
  (gen_random_uuid(),'UR_APPEAR','Appearance','Appearance',NULL,0,'text',NULL,NULL),
  (gen_random_uuid(),'UR_PH','pH','pH',NULL,1,'numeric',NULL,NULL),
  (gen_random_uuid(),'UR_SG','Specific Gravity','Sp. Gravity',NULL,3,'numeric',NULL,NULL),
  (gen_random_uuid(),'UR_PROT','Protein (Albumin)','Protein',NULL,0,'ordinal',
     ARRAY['Negative','Trace','1+','2+','3+','4+'], ARRAY['Negative']),
  (gen_random_uuid(),'UR_GLU','Glucose','Glucose',NULL,0,'ordinal',
     ARRAY['Negative','Trace','1+','2+','3+','4+'], ARRAY['Negative']),
  (gen_random_uuid(),'UR_KET','Ketones','Ketones',NULL,0,'ordinal',
     ARRAY['Negative','Trace','1+','2+','3+','4+'], ARRAY['Negative']),
  (gen_random_uuid(),'UR_BLOOD','Blood','Blood',NULL,0,'ordinal',
     ARRAY['Negative','Trace','1+','2+','3+'], ARRAY['Negative']),
  (gen_random_uuid(),'UR_BIL','Bilirubin','Bilirubin',NULL,0,'ordinal',
     ARRAY['Negative','1+','2+','3+'], ARRAY['Negative']),
  (gen_random_uuid(),'UR_URO','Urobilinogen','Urobilinogen',NULL,0,'ordinal',
     ARRAY['Normal','1+','2+','3+','4+'], ARRAY['Normal']),
  (gen_random_uuid(),'UR_NIT','Nitrite','Nitrite',NULL,0,'ordinal',
     ARRAY['Negative','Positive'], ARRAY['Negative']),
  (gen_random_uuid(),'UR_LEU','Leucocyte Esterase','Leucocytes',NULL,0,'ordinal',
     ARRAY['Negative','Trace','1+','2+','3+'], ARRAY['Negative']),
  (gen_random_uuid(),'UR_PUS','Pus Cells (WBC)','Pus Cells','/hpf',0,'text',NULL,NULL),
  (gen_random_uuid(),'UR_RBC','Red Blood Cells','RBCs','/hpf',0,'text',NULL,NULL),
  (gen_random_uuid(),'UR_EPI','Epithelial Cells','Epithelial Cells','/hpf',0,'text',NULL,NULL),
  (gen_random_uuid(),'UR_CAST','Casts','Casts',NULL,0,'text',NULL,NULL),
  (gen_random_uuid(),'UR_CRYST','Crystals','Crystals',NULL,0,'text',NULL,NULL),
  (gen_random_uuid(),'UR_BACT','Bacteria','Bacteria',NULL,0,'ordinal',
     ARRAY['Absent','Few','Moderate','Many'], ARRAY['Absent'])
ON CONFLICT (code) DO NOTHING;

-- pH and specific gravity are the two numbers on the strip.
INSERT INTO lab_reference_ranges
  (id, tenant_id, analyte_id, sex, age_min_days, age_max_days, ref_low, ref_high, source, source_note)
SELECT gen_random_uuid(), NULL, a.id, 'any', 0, 54750, v.lo, v.hi, 'uyirly_standard',
       'Standard urinalysis reagent strip reporting range'
  FROM (VALUES ('UR_PH', 4.8, 7.4), ('UR_SG', 1.016, 1.022)) AS v(code, lo, hi)
  JOIN lab_analytes a ON a.code = v.code
 WHERE NOT EXISTS (SELECT 1 FROM lab_reference_ranges r
                    WHERE r.analyte_id = a.id AND r.tenant_id IS NULL);

-- ── The panel parents the shared catalogue was missing ──────────────────────

INSERT INTO lab_tests_master (id, name, code, category, sample_type, unit, is_active)
VALUES
  (gen_random_uuid(), 'Liver Function Test (LFT)',  'LFT', 'Biochemistry', 'Blood', NULL, true),
  (gen_random_uuid(), 'Kidney Function Test (KFT)', 'KFT', 'Biochemistry', 'Blood', NULL, true),
  (gen_random_uuid(), 'Thyroid Profile (T3 T4 TSH)','TFT', 'Biochemistry', 'Blood', NULL, true)
ON CONFLICT (code, name, COALESCE(unit, '')) DO NOTHING;

-- ── Panel membership ────────────────────────────────────────────────────────

INSERT INTO lab_test_analytes (id, lab_master_id, analyte_id, display_order)
SELECT gen_random_uuid(), m.id, a.id, x.ord
  FROM (VALUES
    -- Liver function
    ('Liver Function Test (LFT)','TBIL',1), ('Liver Function Test (LFT)','DBIL',2),
    ('Liver Function Test (LFT)','IBIL',3), ('Liver Function Test (LFT)','SGOT',4),
    ('Liver Function Test (LFT)','SGPT',5), ('Liver Function Test (LFT)','ALP',6),
    ('Liver Function Test (LFT)','TP',7),   ('Liver Function Test (LFT)','ALB',8),
    ('Liver Function Test (LFT)','GLOB',9),
    -- Kidney function
    ('Kidney Function Test (KFT)','UREA',1), ('Kidney Function Test (KFT)','BUN',2),
    ('Kidney Function Test (KFT)','CREAT',3),('Kidney Function Test (KFT)','UA',4),
    ('Kidney Function Test (KFT)','NA',5),   ('Kidney Function Test (KFT)','K',6),
    ('Kidney Function Test (KFT)','CL',7),
    -- Lipids
    ('Lipid Profile (Full)','TC',1), ('Lipid Profile (Full)','TRIG',2),
    ('Lipid Profile (Full)','HDL',3),('Lipid Profile (Full)','LDL',4),
    -- Thyroid
    ('Thyroid Profile (T3 T4 TSH)','FT3',1), ('Thyroid Profile (T3 T4 TSH)','FT4',2),
    ('Thyroid Profile (T3 T4 TSH)','TSH',3),
    -- Urine routine and microscopy, in the order a report prints them
    ('Urine Routine & Microscopy (R&M)','UR_COLOUR',1),
    ('Urine Routine & Microscopy (R&M)','UR_APPEAR',2),
    ('Urine Routine & Microscopy (R&M)','UR_PH',3),
    ('Urine Routine & Microscopy (R&M)','UR_SG',4),
    ('Urine Routine & Microscopy (R&M)','UR_PROT',5),
    ('Urine Routine & Microscopy (R&M)','UR_GLU',6),
    ('Urine Routine & Microscopy (R&M)','UR_KET',7),
    ('Urine Routine & Microscopy (R&M)','UR_BLOOD',8),
    ('Urine Routine & Microscopy (R&M)','UR_BIL',9),
    ('Urine Routine & Microscopy (R&M)','UR_URO',10),
    ('Urine Routine & Microscopy (R&M)','UR_NIT',11),
    ('Urine Routine & Microscopy (R&M)','UR_LEU',12),
    ('Urine Routine & Microscopy (R&M)','UR_PUS',13),
    ('Urine Routine & Microscopy (R&M)','UR_RBC',14),
    ('Urine Routine & Microscopy (R&M)','UR_EPI',15),
    ('Urine Routine & Microscopy (R&M)','UR_CAST',16),
    ('Urine Routine & Microscopy (R&M)','UR_CRYST',17),
    ('Urine Routine & Microscopy (R&M)','UR_BACT',18)
  ) AS x(master_name, analyte_code, ord)
  JOIN lab_tests_master m ON m.name = x.master_name
  JOIN lab_analytes a ON a.code = x.analyte_code
ON CONFLICT (lab_master_id, analyte_id) DO NOTHING;

-- ── Single tests: one analyte each, so they inherit a proper range ──────────
--
-- Not grouped, because they are not groups. Linking them simply means a
-- standalone haemoglobin gets the female range for a woman instead of one band
-- for everybody.

INSERT INTO lab_test_analytes (id, lab_master_id, analyte_id, display_order)
SELECT gen_random_uuid(), m.id, a.id, 1
  FROM (VALUES
    ('Haemoglobin','HGB'),
    ('Serum Creatinine','CREAT'),
    ('Random Blood Sugar','RBSG'),
    ('Fasting Blood Glucose','FBG'),
    ('Post-Prandial Blood Glucose (2h)','PPBG'),
    ('HbA1c (Glycated Haemoglobin)','HBA1C'),
    ('Total Cholesterol','TC'),
    ('Triglycerides','TRIG'),
    ('Serum Sodium','NA'),
    ('Serum Potassium','K'),
    ('TSH (Thyroid Stimulating Hormone)','TSH')
  ) AS x(master_name, analyte_code)
  JOIN lab_tests_master m ON m.name = x.master_name
  JOIN lab_analytes a ON a.code = x.analyte_code
ON CONFLICT (lab_master_id, analyte_id) DO NOTHING;
