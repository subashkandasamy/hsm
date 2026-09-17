-- Scope the IPD daily-bill uniqueness to IPD daily bills only ─────────────────
-- idx_bills_ipd_daily_dedup allows one bill per (admission, date, bill_source).
-- ER and OPD bills linked to an admission when the patient is admitted from ER
-- also carry admission_id + billing_date + bill_source, so they took that slot:
-- a second ER charges bill could not be linked, and the day's IPD doctor-round
-- bill could not be created once the ER consultation bill was linked.
-- IPD daily bills never have a visit or ER case, so exclude bills that do.
DROP INDEX IF EXISTS idx_bills_ipd_daily_dedup;
CREATE UNIQUE INDEX idx_bills_ipd_daily_dedup
  ON bills (tenant_id, admission_id, billing_date, bill_source)
  WHERE admission_id IS NOT NULL
    AND billing_date IS NOT NULL
    AND bill_source IS NOT NULL
    AND status <> 'cancelled'
    AND visit_id IS NULL
    AND emergency_case_id IS NULL;
