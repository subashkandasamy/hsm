-- Backfill category on all catalog rows that were seeded from lab_tests_master.
-- Rows with lab_master_id get their category from the master table.
-- Custom tests (lab_master_id IS NULL) keep their existing category value.
UPDATE lab_tests_catalog ltc
SET category = ltm.category
FROM lab_tests_master ltm
WHERE ltc.lab_master_id = ltm.id
  AND ltc.category = 'General';
