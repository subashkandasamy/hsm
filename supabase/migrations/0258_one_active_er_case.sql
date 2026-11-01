-- F-55 — the emergency duplicate guards are read-then-write.
--
-- `registerEmergency` counts active ER cases and active admissions in
-- TypeScript, then inserts. Two concurrent registrations both read zero and
-- both succeed. Same class as F-35 (duplicate admission, fixed by `0245`) and
-- F-52 (duplicate appointment, deferred because partitioning blocks the index).
--
-- Here nothing blocks it: `emergency_cases` is not partitioned, so the
-- constraint the TypeScript is trying to express can simply be stated.
--
-- The consequence is milder than the other two — two casualty cases for one
-- arrival, which a nurse notices immediately — but the window is real at a
-- reception desk with two terminals, which is exactly how an emergency arrival
-- gets registered twice.
--
-- Verified before adding: 5 rows, statuses in use are 'waiting' and
-- 'in_treatment', and 0 patients currently hold more than one active case, so
-- the index builds without conflict.
--
-- `patient_id` is nullable for an unidentified arrival, and distinct NULLs do
-- not conflict in a unique index — so a trolley of unknown casualties is
-- unaffected, which is correct: each is a separate person.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_emergency_one_active_case_per_patient
  ON public.emergency_cases (tenant_id, patient_id)
  WHERE status IN ('waiting', 'in_treatment');

COMMENT ON INDEX public.idx_emergency_one_active_case_per_patient IS
  'One open casualty case per patient (F-55). The TypeScript check in registerEmergency stays as the friendly message; this is what makes it true under concurrency.';

COMMIT;
