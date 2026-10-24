-- The two anaemia discriminant indices an Erba H360 calculates.
--
--   Mentzer Index  MCV / RBC            below 13  suggests thalassaemia trait
--   RDWI           MCV * RDW / RBC      below 220 suggests thalassaemia trait
--
-- Both separate iron deficiency anaemia from beta-thalassaemia trait, which
-- matters in Tamil Nadu: the trait is common, the two look alike on a count,
-- and one is treated with iron while the other must not be.
--
-- ── The provenance, recorded because somebody will ask ────────────────────
--
-- The instrument prints these with an asterisk and the words "Research use
-- only, not for diagnostic use" — the manufacturer declining to stand behind
-- them. Reporting them therefore puts the hospital's name on a number its
-- maker disclaims.
--
-- That was put to the hospital and they chose to report them, which is their
-- decision to make: it is their report and their clinicians reading it. The
-- alternative offered was to calculate both ourselves from MCV, RBC and RDW,
-- all of which are mapped and verified against the machine, so that the
-- arithmetic is ours and checkable. That remains available if the view
-- changes.

INSERT INTO lab_analytes (id, code, name, short_name, unit_ucum, decimals, value_type, is_active)
VALUES
  (gen_random_uuid(), 'MENTZER', 'Mentzer Index',                NULL, NULL, 2, 'numeric', true),
  (gen_random_uuid(), 'RDWI',    'Red Cell Distribution Width Index', NULL, NULL, 2, 'numeric', true)
ON CONFLICT (code) DO NOTHING;

-- At the end of the count, where a derived figure belongs: after everything
-- it was derived from.
WITH cbc AS (SELECT id FROM lab_tests_master WHERE name ILIKE '%Complete Blood Count%' LIMIT 1),
next_order AS (
  SELECT COALESCE(max(display_order), 0) AS n
    FROM lab_test_analytes ta JOIN cbc ON cbc.id = ta.lab_master_id
),
additions(code, offset_) AS (VALUES ('MENTZER', 1), ('RDWI', 2))
INSERT INTO lab_test_analytes (id, lab_master_id, analyte_id, display_order)
SELECT gen_random_uuid(), cbc.id, a.id, next_order.n + additions.offset_
  FROM additions
  JOIN lab_analytes a ON a.code = additions.code
  CROSS JOIN cbc CROSS JOIN next_order
 WHERE NOT EXISTS (
   SELECT 1 FROM lab_test_analytes ex WHERE ex.lab_master_id = cbc.id AND ex.analyte_id = a.id
 );
