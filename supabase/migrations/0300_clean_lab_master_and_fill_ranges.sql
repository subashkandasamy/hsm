-- Clean the shared lab master, and give every hospital test that has no
-- normal range the Uyirly standard one. Approved by the platform owner on
-- 13 Nov 2026 ("if KMCH doesn't have a normal value, use the Uyirly standard";
-- "merge it"; the master duplicate list, "ok").
--
-- What was wrong with the master (591 tests), found 13 Nov:
--
--  a) KMCH's old test list (SwiftEHR) was copied into the shared master on
--     7 Nov — 157 rows, which every new hospital is offered in "Add from
--     Master":
--       * 82 are not tests but single report lines of KMCH's panels ("Ph",
--         "Na", "Gra", "Mid", "Sg", protein-electrophoresis fractions, blood
--         gas sub-sections). "Pct" there is plateletcrit, offered next to
--         Procalcitonin. They are switched off in the master; KMCH's own
--         copies keep working exactly as before (a switched-off master test
--         is only hidden from "Add from Master").
--       * 28 are the same test the master already had, properly built, under
--         "General" — same range, often missing the measurement lines (RFT
--         has none; Kidney Function Test has 7). Merged into the built one.
--       * 47 are unique and stay.
--  b) The original master lists 16 tests twice, under two groups (Urine
--     Culture under Microbiology and under Urine Analysis, …). 17 extra
--     copies; no hospital uses any of them. Merged into one.
--
-- MERGE: every hospital test linked to the extra copy is re-linked to the one
-- kept — its name, price and code are the hospital's and do not change; a
-- "General" category and an empty sample type take the kept test's. A
-- hospital that already has the kept test keeps both rows untouched. The
-- extra copy is switched off.
--
-- RANGES: a hospital test with no range at all (no low, no high, no printed
-- text) takes the master's, unit included, where the master has one. Only for
-- tests without measurement lines, and never across units. Run before and
-- after the merge.
--
-- KMCH had no lab orders when this was written, so no existing result reads
-- differently. Every changed hospital row gets an audit entry (no actor,
-- "Uyirly support, approved by platform owner"). Each step checks its count
-- against the dry run of 13 Nov and stops the whole migration if it differs.

BEGIN;

CREATE TABLE _merge_0300 (
  from_name     text NOT NULL,
  from_category text NOT NULL,
  to_name       text NOT NULL,
  to_category   text NOT NULL,
  from_id       uuid,
  to_id         uuid
);
INSERT INTO _merge_0300 (from_name, from_category, to_name, to_category) VALUES
    -- a) KMCH's "General" copies of tests the master already had
('Renal Function Test (RFT)', 'General', 'Kidney Function Test (KFT)', 'Biochemistry'),
    ('Urine Routine and Microscopy', 'General', 'Urine Routine & Microscopy (R&M)', 'Urine Analysis'),
    ('Fasting Blood Sugar (FBS)', 'General', 'Fasting Blood Glucose', 'Blood Glucose & Diabetes'),
    ('Post Prandial Blood Sugar (PPBS)', 'General', 'Post-Prandial Blood Glucose (2h)', 'Blood Glucose & Diabetes'),
    ('Random Sugar', 'General', 'Random Blood Sugar', 'Blood Glucose & Diabetes'),
    ('Glucose Tolerance Test (GTT)', 'General', 'Oral Glucose Tolerance Test (75g)', 'Blood Glucose & Diabetes'),
    ('Ionised Calcium', 'General', 'Ionized Calcium', 'Electrolytes & Minerals'),
    ('Triiodothyronine (T3)', 'General', 'Total T3', 'Thyroid'),
    ('Thyroxine (T4)', 'General', 'Total T4', 'Thyroid'),
    ('Folic Acid', 'General', 'Folate (Folic Acid) – Serum', 'Vitamins & Nutrition'),
    ('Ferritin', 'General', 'Serum Ferritin', 'Vitamins & Nutrition'),
    ('Total Iron Binding Capacity (TIBC)', 'General', 'TIBC (Total Iron Binding Capacity)', 'Vitamins & Nutrition'),
    ('Alpha Fetoprotein (AFP)', 'General', 'AFP (Alpha-Fetoprotein)', 'Tumour Markers'),
    ('Prostate Specific Antigen (PSA)', 'General', 'PSA (Prostate-Specific Antigen)', 'Tumour Markers'),
    ('Complement ( C3 )', 'General', 'Complement C3', 'Autoimmune & Rheumatology'),
    ('Complement ( C4 )', 'General', 'Complement C4', 'Autoimmune & Rheumatology'),
    ('High Sensitivity C-Reactive Protein (hs-CRP)', 'General', 'hs-CRP (High-Sensitivity CRP)', 'Cardiac Markers'),
    ('Creatine Phosphokinase (CPK)', 'General', 'Total CK (Creatine Kinase)', 'Cardiac Markers'),
    ('Immunoglobulin E (IgE)', 'General', 'IgE (Total)', 'Allergy & Immunology'),
    ('Dengue NS1', 'General', 'Dengue NS1 Antigen', 'Virology & Serology'),
    ('Typhidot IgM (S. typhi OMP antibody)', 'General', 'Typhoid IgM Rapid (Typhi Dot)', 'Virology & Serology'),
    ('Malaria Parasite Antigen (Rapid Card)', 'General', 'Malaria Antigen (PF/PV)', 'Parasitology'),
    ('Sputum AFB Smear', 'General', 'AFB Smear – Sputum (ZN Stain)', 'Tuberculosis & AFB'),
    ('Urine Culture and Sensitivity', 'General', 'Urine Culture & Sensitivity', 'Microbiology – Culture & Sensitivity'),
    ('Sputum Culture and Sensitivity', 'General', 'Sputum Culture & Sensitivity', 'Microbiology – Culture & Sensitivity'),
    ('Pleural Fluid Culture and Sensitivity', 'General', 'Pleural Fluid Culture & Sensitivity', 'Body Fluid Analysis'),
    ('Stool Occult Blood', 'General', 'Faecal Occult Blood (FOBT)', 'Stool & GI Tests'),
    ('Blood Group and Rh Typing', 'General', 'Blood Group & Rh Factor', 'Haematology'),
    -- b) the original master's own second copies
('Urine Culture & Sensitivity', 'Urine Analysis', 'Urine Culture & Sensitivity', 'Microbiology – Culture & Sensitivity'),
    ('Stool Culture & Sensitivity', 'Stool & GI Tests', 'Stool Culture & Sensitivity', 'Microbiology – Culture & Sensitivity'),
    ('CSF Culture & Sensitivity', 'CSF Analysis', 'CSF Culture & Sensitivity', 'Microbiology – Culture & Sensitivity'),
    ('Ascitic Fluid Culture & Sensitivity', 'Body Fluid Analysis', 'Ascitic Fluid Culture & Sensitivity', 'Microbiology – Culture & Sensitivity'),
    ('CSF AFB Smear', 'CSF Analysis', 'AFB Smear – CSF', 'Tuberculosis & AFB'),
    ('Protein C Activity', 'Coagulation Profile', 'Protein C Activity', 'Thrombophilia'),
    ('Protein S (Free)', 'Coagulation Profile', 'Protein S (Free)', 'Thrombophilia'),
    ('Antithrombin III (AT-III)', 'Coagulation Profile', 'Antithrombin III Activity', 'Thrombophilia'),
    ('Lupus Anticoagulant', 'Autoimmune & Rheumatology', 'Lupus Anticoagulant Screen', 'Thrombophilia'),
    ('Plasma Fibrinogen', 'Inflammatory Markers', 'Fibrinogen', 'Coagulation Profile'),
    ('Homocysteine (Cardiac)', 'Cardiac Markers', 'Homocysteine', 'Vitamins & Nutrition'),
    ('Homocysteine (Thrombophilia)', 'Thrombophilia', 'Homocysteine', 'Vitamins & Nutrition'),
    ('Thyroglobulin (Tumour)', 'Tumour Markers', 'Thyroglobulin', 'Thyroid'),
    ('Serum Ferritin (Inflammatory)', 'Inflammatory Markers', 'Serum Ferritin', 'Vitamins & Nutrition'),
    ('Total IgE', 'Allergy & Immunology', 'IgE (Total)', 'Allergy & Immunology'),
    ('Lipoprotein (a) – Cardiac', 'Cardiac Markers', 'Lipoprotein (a) [Lp(a)]', 'Lipids'),
    ('Microalbumin/Creatinine Ratio (Spot)', 'Blood Glucose & Diabetes', 'Urine Albumin/Creatinine Ratio', 'Urine Analysis');

-- A name that matches more than one row fails the subquery and stops here.
UPDATE _merge_0300 p
   SET from_id = (SELECT m.id FROM lab_tests_master m WHERE m.name = p.from_name AND m.category = p.from_category),
       to_id   = (SELECT m.id FROM lab_tests_master m WHERE m.name = p.to_name   AND m.category = p.to_category);

DO $$
DECLARE missing text; chained int; total int;
BEGIN
  SELECT string_agg(from_name || ' (' || from_category || ')', ', ') INTO missing
    FROM _merge_0300 WHERE from_id IS NULL OR to_id IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '0300: these merge pairs did not resolve: %', missing;
  END IF;
  -- A test kept by one pair must not be switched off by another.
  SELECT count(*) INTO chained FROM _merge_0300 a JOIN _merge_0300 b ON a.to_id = b.from_id;
  SELECT count(*) INTO total FROM _merge_0300;
  IF chained > 0 OR total <> 45 THEN
    RAISE EXCEPTION '0300: expected 45 independent pairs, found % (% chained)', total, chained;
  END IF;
END $$;

-- ── The range fill, used twice ──────────────────────────────────────────────
CREATE FUNCTION _fill_0300() RETURNS int LANGUAGE plpgsql AS $fill$
DECLARE n int;
BEGIN
  WITH f AS (
    SELECT c.id, c.tenant_id, m.ref_low, m.ref_high, m.reference_range,
           COALESCE(NULLIF(btrim(c.unit), ''), m.unit) AS unit
      FROM lab_tests_catalog c
      JOIN lab_tests_master m ON m.id = c.lab_master_id
     WHERE c.ref_low IS NULL AND c.ref_high IS NULL
       AND COALESCE(btrim(c.reference_range), '') = ''
       AND (m.ref_low IS NOT NULL OR m.ref_high IS NOT NULL
            OR COALESCE(btrim(m.reference_range), '') <> '')
       AND NOT EXISTS (SELECT 1 FROM lab_test_analytes ta WHERE ta.lab_master_id = m.id)
       AND (COALESCE(btrim(c.unit), '') = '' OR m.unit IS NULL
            OR lower(btrim(c.unit)) = lower(btrim(m.unit)))
  ), logged AS (
    INSERT INTO audit_logs (id, tenant_id, actor_id, action, entity, entity_id, meta)
    SELECT gen_random_uuid(), f.tenant_id, NULL, 'update', 'lab_test', f.id,
           jsonb_build_object(
             'change', 'normal range filled from the Uyirly standard',
             'ref_low', f.ref_low, 'ref_high', f.ref_high,
             'reference_range', f.reference_range, 'unit', f.unit,
             'note', 'Uyirly support, approved by platform owner (13 Nov 2026)',
             'migration', '0300')
      FROM f
  )
  UPDATE lab_tests_catalog c
     SET ref_low = f.ref_low, ref_high = f.ref_high,
         reference_range = f.reference_range, unit = f.unit
    FROM f
   WHERE c.id = f.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $fill$;

-- ── Ranges, from the test each row is linked to now (dry run: 67) ───────────
DO $$
DECLARE n int;
BEGIN
  n := _fill_0300();
  IF n <> 67 THEN RAISE EXCEPTION '0300: range fill expected 67 rows, would change %', n; END IF;
END $$;

-- ── Merge (dry run: 29 hospital rows — 28 KMCH, 1 demo) ────────────────────
DO $$
DECLARE n int;
BEGIN
  WITH r AS (
    SELECT c.id, c.tenant_id, p.from_name, p.to_name, p.to_id, p.to_category,
           t.sample_type AS to_sample
      FROM lab_tests_catalog c
      JOIN _merge_0300 p      ON p.from_id = c.lab_master_id
      JOIN lab_tests_master t ON t.id = p.to_id
     WHERE NOT EXISTS (SELECT 1 FROM lab_tests_catalog x
                        WHERE x.tenant_id = c.tenant_id AND x.lab_master_id = p.to_id)
  ), logged AS (
    INSERT INTO audit_logs (id, tenant_id, actor_id, action, entity, entity_id, meta)
    SELECT gen_random_uuid(), r.tenant_id, NULL, 'update', 'lab_test', r.id,
           jsonb_build_object(
             'change', 'linked to the Uyirly master test it duplicated',
             'from', r.from_name, 'to', r.to_name,
             'note', 'Uyirly support, approved by platform owner (13 Nov 2026)',
             'migration', '0300')
      FROM r
  )
  UPDATE lab_tests_catalog c
     SET lab_master_id = r.to_id,
         category      = CASE WHEN c.category IS NULL OR c.category = 'General'
                              THEN r.to_category ELSE c.category END,
         sample_type   = COALESCE(NULLIF(btrim(c.sample_type), ''), r.to_sample)
    FROM r
   WHERE c.id = r.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 29 THEN RAISE EXCEPTION '0300: merge expected 29 hospital rows, would change %', n; END IF;

  UPDATE lab_tests_master m SET is_active = false
    FROM _merge_0300 p WHERE m.id = p.from_id AND m.is_active;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 45 THEN RAISE EXCEPTION '0300: expected to switch off 45 duplicate master tests, would switch off %', n; END IF;
END $$;

-- ── KMCH's report lines out of "Add from Master" (dry run: 82) ─────────────
-- The rows copied in from KMCH on 7 Nov that KMCH itself marks part-of-panel.
DO $$
DECLARE n int;
BEGIN
  UPDATE lab_tests_master
     SET is_active = false
   WHERE package_only AND is_active
     AND created_at >= '2026-11-07' AND created_at < '2026-11-08';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 82 THEN RAISE EXCEPTION '0300: expected to switch off 82 report-line rows, would switch off %', n; END IF;
END $$;

-- ── Ranges again, from the test each re-linked row belongs to now ───────────
SELECT _fill_0300();

DROP FUNCTION _fill_0300();
DROP TABLE _merge_0300;

COMMIT;
