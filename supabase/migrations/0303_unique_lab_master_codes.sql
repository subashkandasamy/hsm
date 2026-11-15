-- Two pairs of master tests shared a code:
--   TG     Triglycerides (Lipids)            and Thyroglobulin (Thyroid)
--   17OHP  17-OH Progesterone (Hormones)     and 17-Hydroxyprogesterone (CAH Screen) (Neonatal)
-- Both came from 0049. A hospital's codes are unique (0138), so whichever of a
-- pair was added first blocked the other for good — found by the lab E2E run,
-- where "Activate All" could never add Thyroglobulin or the CAH screen.
--
-- The second of each pair gets its own code. Copies already in a hospital's
-- catalogue keep the code they were given (none of these two is in any
-- hospital's catalogue today), and a unique index stops a clash coming back.

UPDATE lab_tests_master SET code = 'THYROGLOB'
 WHERE id = '6dc2e6b9-62ca-4776-af5c-c8d85727482b' AND name = 'Thyroglobulin' AND code = 'TG';

UPDATE lab_tests_master SET code = '17OHP_NB'
 WHERE id = 'ec31a7d0-d517-4459-9e4a-af5719b3a4ce' AND name = '17-Hydroxyprogesterone (CAH Screen)' AND code = '17OHP';

DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(c, ', ') INTO dup FROM (
    SELECT upper(code) AS c FROM lab_tests_master WHERE code IS NOT NULL GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION 'lab_tests_master still has shared codes: %', dup;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS lab_tests_master_code_key
  ON lab_tests_master (upper(code)) WHERE code IS NOT NULL;
