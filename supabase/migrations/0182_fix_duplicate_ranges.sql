-- Repairing a regression the critical-limits migration caused.
--
-- 0181 inserted a bare row per analyte to carry the critical limits, then
-- copied those limits onto the rows that already held reference ranges. That
-- second step was right, and it made the first row redundant — but the bare row
-- was left behind, and for potassium, sodium and glucose it had exactly the
-- same specificity as the real one: tenant NULL, sex 'any', same age band.
--
-- resolve_reference_range returns ONE row and had no tiebreak, so it picked
-- arbitrarily. It picked the bare one. Potassium, sodium and random blood sugar
-- silently lost their reference ranges and would have flagged every result
-- 'unranged' — no high, no low, nothing.
--
-- Two fixes, because one of them is not enough on its own.

-- 1. Drop the redundant rows, now that the real ones carry the critical limits.
--    Only where a competing row of the same specificity exists: haemoglobin and
--    platelets keep theirs, because their reference rows are sex-specific and a
--    bare 'any' row is the only thing that gives a patient of unrecorded sex a
--    critical limit at all.
DELETE FROM lab_reference_ranges bare
 WHERE bare.tenant_id IS NULL
   AND bare.ref_low IS NULL AND bare.ref_high IS NULL
   AND EXISTS (
     SELECT 1 FROM lab_reference_ranges real
      WHERE real.analyte_id = bare.analyte_id
        AND real.tenant_id IS NULL
        AND real.sex = bare.sex
        AND real.age_min_days = bare.age_min_days
        AND real.age_max_days = bare.age_max_days
        AND real.id <> bare.id
        AND (real.ref_low IS NOT NULL OR real.ref_high IS NOT NULL)
   );

-- 2. Give the resolver a deterministic tiebreak, so a future duplicate cannot
--    silently swallow a reference range again. A row that states a range beats
--    one that does not; after that, the newest wins, which is at least stable.
CREATE OR REPLACE FUNCTION resolve_reference_range(
  p_analyte  uuid,
  p_tenant   uuid,
  p_sex      text,
  p_age_days int
) RETURNS lab_reference_ranges
LANGUAGE sql STABLE AS $$
  SELECT r.*
    FROM lab_reference_ranges r
   WHERE r.analyte_id = p_analyte
     AND (r.tenant_id IS NULL OR r.tenant_id = p_tenant)
     AND (r.sex = 'any' OR r.sex = COALESCE(p_sex, 'any'))
     AND COALESCE(p_age_days, 0) BETWEEN r.age_min_days AND r.age_max_days
   ORDER BY (r.tenant_id IS NOT NULL) DESC,
            (r.sex <> 'any') DESC,
            (r.age_max_days - r.age_min_days) ASC,
            (r.ref_low IS NOT NULL OR r.ref_high IS NOT NULL) DESC,
            r.created_at DESC
   LIMIT 1
$$;

-- A guard, so this cannot recur: one standard row per analyte, sex and age band.
CREATE UNIQUE INDEX IF NOT EXISTS lab_ref_one_standard_per_band
  ON lab_reference_ranges (analyte_id, sex, age_min_days, age_max_days)
  WHERE tenant_id IS NULL;
