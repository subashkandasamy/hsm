-- Re-link ER bills that could not be moved onto their admission ────────────────
-- Before 0139, linking a second ER bill hit idx_bills_ipd_daily_dedup and was
-- skipped. Link any live ER-case bill whose case was admitted.
UPDATE bills b
SET admission_id = a.id
FROM admissions a
WHERE a.source_emergency_case_id = b.emergency_case_id
  AND b.emergency_case_id IS NOT NULL
  AND b.admission_id IS NULL
  AND b.status <> 'cancelled';
