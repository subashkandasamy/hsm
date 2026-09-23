-- Stop selling measurements that no laboratory can actually perform.
--
-- The shared catalogue offers MCV, MCHC, RDW, MPV, every differential
-- percentage and every absolute count as separately orderable, priceable tests.
-- None of them can be run on their own — they are arithmetic the analyzer does
-- while producing a CBC. You cannot walk into a laboratory and order an MCHC.
--
-- Same for the calculated chemistry: globulin is total protein minus albumin,
-- indirect bilirubin is total minus direct, VLDL is triglycerides over five.
-- A hospital could activate "A:G Ratio" at ₹200 and be selling a division.
--
-- These stay in the database because they are real measurements — they are the
-- analytes a panel reports. They simply stop being things you can order and
-- charge for on their own.
--
-- ── What is deliberately NOT in this list ──────────────────────────────────
--
-- Several ratios ARE genuine standalone tests and are left alone:
--   Urine Albumin/Creatinine and Protein/Creatinine — ordered by name for
--     diabetic nephropathy and proteinuria, run as their own spot-urine test
--   Microalbumin/Creatinine Ratio (Spot) — the same test under another name
--   CD4/CD8 Ratio — part of the flow cytometry a lab genuinely offers
--   Transferrin Saturation — reported with iron studies, which labs sell
-- Being a ratio does not make something unorderable. Being unperformable does.

ALTER TABLE lab_tests_master
  ADD COLUMN IF NOT EXISTS panel_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN lab_tests_master.panel_only IS
  'True when this measurement can only be produced as part of a panel — an index, a differential, or a calculated value. Hidden from the activation list so nobody can put a price on something the laboratory cannot run.';

UPDATE lab_tests_master SET panel_only = true
 WHERE code IN (
   -- Red cell and platelet indices: calculated from haemoglobin, haematocrit
   -- and the cell counts, never measured directly.
   'MCV', 'MCH', 'MCHC', 'RDW', 'MPV',
   -- The differential. An analyzer reports these while doing a CBC; a lab
   -- wanting them on their own does a peripheral smear, which is its own test.
   'NEUT%', 'LYMPH%', 'MONO%', 'EOS%', 'BASO%',
   -- Absolute counts = total white count × the percentage above.
   'ANC', 'ALC',
   -- Calculated chemistry.
   'GLOB',      -- total protein − albumin
   'AGRATIO',   -- albumin ÷ globulin
   'IBIL',      -- total − direct bilirubin
   'BUNCR',     -- a division
   'VLDL',      -- triglycerides ÷ 5
   'NONHDL',    -- total − HDL
   'LDLHDL',    -- a division
   'TCHDL'      -- a division
 );

-- A hospital that already activated one of these is selling something it
-- cannot perform, so switch those off — but only those, and only where the
-- link to the master test is certain. Their price and settings are kept, so
-- reversing this is one click if a laboratory disagrees.
UPDATE lab_tests_catalog c SET is_active = false
  FROM lab_tests_master m
 WHERE c.lab_master_id = m.id
   AND m.panel_only
   AND c.is_active;

-- ── Folders must not share a name with a test inside them ──────────────────
--
-- "Lipid Profile" was a category of 13 tests AND the name of the panel sitting
-- inside it, so the activation screen showed two rows a line apart with almost
-- the same name and no way to tell which was which. Renaming the folder is the
-- smaller change — the test names are what clinicians say out loud.
--
-- The categories that are genuinely useful for browsing 434 tests — Urine
-- Analysis, Microbiology, Hormones, Tumour Markers, Vitamins and the rest —
-- are untouched. They collide with nothing.

UPDATE lab_tests_master SET category = 'Haematology'  WHERE category = 'Complete Blood Count';
UPDATE lab_tests_master SET category = 'Liver'        WHERE category = 'Liver Function Tests';
UPDATE lab_tests_master SET category = 'Kidney'       WHERE category = 'Kidney Function Tests';
UPDATE lab_tests_master SET category = 'Lipids'       WHERE category = 'Lipid Profile';
UPDATE lab_tests_master SET category = 'Thyroid'      WHERE category = 'Thyroid Function Tests';
