-- The indices a haematology analyzer reports and our catalogue did not hold.
--
-- Found by connecting the first real instrument: an Erba H360 in Karur sent
-- thirty-two measurements, six of which had nowhere to go. They are not exotic
-- — every modern cell counter reports them, they print on the analyzer's own
-- slip, and a laboratory that sees them on the machine and not on the report
-- assumes the report is wrong.
--
-- Platelet indices tell you about platelet size and variability, which is how
-- a reactive thrombocytosis is told from a clonal one. Red cell distribution
-- width in SD is the companion to the CV we already had, and the two are read
-- together in an anaemia workup.
--
-- Units taken from what the instrument actually transmits, not from a
-- textbook: PDW arrives in fL and %, PCT in %, P-LCC as a count. Reference
-- ranges are left to each hospital, as they are for every other analyte here —
-- they vary by population and by machine.

INSERT INTO lab_analytes (id, code, name, short_name, unit_ucum, decimals, value_type, is_active)
VALUES
  (gen_random_uuid(), 'PCT',    'Plateletcrit',                        'PCT',    '%',       3, 'numeric', true),
  (gen_random_uuid(), 'PDW_CV', 'Platelet Distribution Width (CV)',    'PDW-CV', '%',       1, 'numeric', true),
  (gen_random_uuid(), 'PDW_SD', 'Platelet Distribution Width (SD)',    'PDW-SD', 'fL',      1, 'numeric', true),
  (gen_random_uuid(), 'P_LCR',  'Large Platelet Ratio',                'P-LCR',  '%',       1, 'numeric', true),
  (gen_random_uuid(), 'P_LCC',  'Large Platelet Count',                'P-LCC',  '10*9/L',  0, 'numeric', true),
  (gen_random_uuid(), 'RDW_SD', 'Red Cell Distribution Width (SD)',    'RDW-SD', 'fL',      1, 'numeric', true)
ON CONFLICT (code) DO NOTHING;

-- Onto the Complete Blood Count, after the parameters they belong beside:
-- RDW-SD next to RDW-CV, the platelet indices after MPV. A report that lists
-- them in the order the analyzer prints them is one a technician can check
-- against the machine at a glance.
WITH cbc AS (
  SELECT id FROM lab_tests_master WHERE name ILIKE '%Complete Blood Count%' LIMIT 1
),
next_order AS (
  SELECT COALESCE(max(display_order), 0) AS n
    FROM lab_test_analytes ta JOIN cbc ON cbc.id = ta.lab_master_id
),
additions(code, offset_) AS (VALUES
  ('RDW_SD', 1), ('PCT', 2), ('PDW_CV', 3), ('PDW_SD', 4), ('P_LCR', 5), ('P_LCC', 6)
)
INSERT INTO lab_test_analytes (id, lab_master_id, analyte_id, display_order)
SELECT gen_random_uuid(), cbc.id, a.id, next_order.n + additions.offset_
  FROM additions
  JOIN lab_analytes a ON a.code = additions.code
  CROSS JOIN cbc CROSS JOIN next_order
 WHERE NOT EXISTS (
   SELECT 1 FROM lab_test_analytes ex
    WHERE ex.lab_master_id = cbc.id AND ex.analyte_id = a.id
 );
