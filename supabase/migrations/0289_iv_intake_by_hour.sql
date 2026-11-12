-- 0289 — IV intake hour by hour, from the running drip.
--
-- KMCH's Intake & Output chart has an "IVF / Medication ml/Hr" column: the
-- nurse writes what went in each hour. 0285 wrote a bag's whole volume once,
-- when the bag finished (one row per bag, enforced by a unique index). Now a
-- running bag can be charted hour by hour at its ordered rate, and finishing
-- it adds only what was not yet charted — so the bag still totals its volume,
-- never more. Several rows per bag, so the index is no longer unique.
--
-- No double counting is left to the database: the server works out each
-- entry from what is already charted for that bag (src/app/actions/ipdTreatment.ts).

DROP INDEX IF EXISTS idx_icu_fluid_from_bag;
CREATE INDEX IF NOT EXISTS idx_icu_fluid_by_bag
  ON icu_fluid_balance (source_schedule_id, recorded_at) WHERE source_schedule_id IS NOT NULL;

COMMENT ON COLUMN icu_fluid_balance.source_schedule_id IS 'The IV bag (ipd_admin_schedule row) this intake came from — hourly entries at the ordered rate, then the remainder when the bag finished. Together they never exceed the bag''s volume.';

NOTIFY pgrst, 'reload schema';
