-- ============================================================
-- Fix: re-add consultation_fee and billing_status to the
-- partitioned visits table.
--
-- Root cause: migration 0011_phase10_partitioning.sql did
-- DROP TABLE IF EXISTS visits CASCADE and recreated it without
-- the Phase 5 columns (added by 0006_phase5_billing_insurance).
-- This caused closeVisit / emergency discharge to fail with
-- "column does not exist" and silently not close the visit.
-- ============================================================

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS consultation_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_status   text    NOT NULL DEFAULT 'unbilled'
    CHECK (billing_status IN ('unbilled','billed','waived'));
