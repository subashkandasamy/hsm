-- Point each hospital's own test list at the shared catalogue, where that can
-- be done without guessing.
--
-- A tenant's lab_tests_catalog row only gains analytes — a CBC that is twenty
-- measurements rather than one — if it is linked to the master test the panel
-- membership hangs off. Most existing rows have no link because they were typed
-- by hand rather than activated from the master list.
--
-- Two passes, both requiring an UNAMBIGUOUS match:
--   1. exactly one master row with the same code
--   2. exactly one master row with the same name
--
-- Anything matching zero rows, or more than one, is left alone. A hospital's
-- "LFT" or "Thyroid Profile" is its own local panel and has no master
-- equivalent; linking it to something approximate would attach the wrong
-- analytes to a real patient's result, which is far worse than leaving it as
-- the single-value test it is today.
--
-- Safe to re-run: it only ever fills a NULL.

-- Pass 1 — by code.
UPDATE lab_tests_catalog c
   SET lab_master_id = m.id
  FROM lab_tests_master m
 WHERE c.lab_master_id IS NULL
   AND upper(trim(m.code)) = upper(trim(c.code))
   AND (SELECT count(*) FROM lab_tests_master m2
         WHERE upper(trim(m2.code)) = upper(trim(c.code))) = 1;

-- Pass 2 — by name, for the ones whose local code differs (a hospital writing
-- CREA where the master says SCREAT, and similar).
UPDATE lab_tests_catalog c
   SET lab_master_id = m.id
  FROM lab_tests_master m
 WHERE c.lab_master_id IS NULL
   AND lower(trim(m.name)) = lower(trim(c.name))
   AND (SELECT count(*) FROM lab_tests_master m2
         WHERE lower(trim(m2.name)) = lower(trim(c.name))) = 1;
