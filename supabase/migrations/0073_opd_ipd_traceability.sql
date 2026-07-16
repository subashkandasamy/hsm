-- =====================================================================
-- 0073_opd_ipd_traceability.sql
-- Link an IPD admission back to the OPD visit it was created from, so
-- insurance can treat a same-day OPD→IPD case as one continuous encounter
-- instead of two disconnected claims.
--
-- No hard FK to visits(id): visits is a partitioned table, and this
-- codebase's existing convention (see bills.visit_id) is a plain UUID
-- column with no FK constraint, resolved at the application layer.
-- =====================================================================

ALTER TABLE admissions
  ADD COLUMN IF NOT EXISTS source_visit_id UUID;

CREATE INDEX IF NOT EXISTS idx_admissions_source_visit ON admissions (source_visit_id) WHERE source_visit_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
