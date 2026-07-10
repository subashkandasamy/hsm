-- Re-backfill catalog tests whose category is still 'General' but have a
-- lab_master_id — these were activated after migration 0050 ran and didn't
-- inherit the correct category (activateFromMaster action now sets category,
-- but this fixes existing rows).
UPDATE lab_tests_catalog ltc
SET category = ltm.category
FROM lab_tests_master ltm
WHERE ltc.lab_master_id = ltm.id
  AND ltc.category = 'General';
