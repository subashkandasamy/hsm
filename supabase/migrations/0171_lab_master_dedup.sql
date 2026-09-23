-- The shared test catalogue was seeded twice.
--
-- 864 rows for 431 real tests: the full list was inserted on 9 July and again on
-- 11 July, and lab_tests_master had no unique constraint to stop it. Every
-- hospital picking tests from the master list has been shown each one twice.
--
-- Deduplicated on (code, name, unit) rather than on code alone, because 'TG' is
-- not a duplicate — it is Triglycerides in mg/dL and Thyroglobulin in ng/mL,
-- two genuinely different tests colliding on an abbreviation. Three codes are
-- like this. Deduplicating on code would have silently deleted one of each.
--
-- Doing this now while exactly two tenant catalogue rows reference the master.
-- At twenty customers it would be a migration nobody wants to write.

-- Re-point any tenant catalogue row at the row we are keeping, before deleting.
WITH ranked AS (
  SELECT id, code, name, COALESCE(unit, '') AS u,
         first_value(id) OVER (
           PARTITION BY code, name, COALESCE(unit, '')
           ORDER BY created_at, id
         ) AS keeper
    FROM lab_tests_master
)
UPDATE lab_tests_catalog c
   SET lab_master_id = r.keeper
  FROM ranked r
 WHERE c.lab_master_id = r.id
   AND r.id <> r.keeper;

-- Now drop the surplus copies, keeping the earliest of each.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY code, name, COALESCE(unit, '')
           ORDER BY created_at, id
         ) AS rn
    FROM lab_tests_master
)
DELETE FROM lab_tests_master m
 USING ranked r
 WHERE m.id = r.id AND r.rn > 1;

-- And make it impossible to seed twice again.
CREATE UNIQUE INDEX IF NOT EXISTS lab_tests_master_identity_key
  ON lab_tests_master (code, name, COALESCE(unit, ''));
