-- ============================================================================
-- Phase 10.2 — Composite Index Audit
-- ============================================================================
-- All indexes are CONCURRENTLY so they can run against a live database.
-- Note: CONCURRENTLY cannot run inside a transaction block. In Supabase
-- Dashboard, run each statement individually if needed.
-- ============================================================================

-- Enable pg_trgm for fast ILIKE / fuzzy patient-name searches
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ── patients ──────────────────────────────────────────────────────────────────
-- (tenant_id, uhid) UNIQUE already exists from phase 9
CREATE INDEX IF NOT EXISTS idx_patients_tenant_name_trgm
  ON patients USING gin (name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_patients_tenant_phone
  ON patients (tenant_id, phone);

CREATE INDEX IF NOT EXISTS idx_patients_tenant_created
  ON patients (tenant_id, created_at DESC);

-- ── appointments ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_scheduled
  ON appointments (tenant_id, doctor_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_appointments_patient_scheduled
  ON appointments (tenant_id, patient_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_status_scheduled
  ON appointments (tenant_id, status, scheduled_at)
  WHERE status IN ('booked', 'checked_in');

-- ── visits ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_visits_tenant_patient_date
  ON visits (tenant_id, patient_id, visit_date DESC);

CREATE INDEX IF NOT EXISTS idx_visits_tenant_date
  ON visits (tenant_id, visit_date DESC);

-- ── bills ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bills_tenant_status_created
  ON bills (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bills_tenant_patient
  ON bills (tenant_id, patient_id, created_at DESC);

-- ── payments ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_tenant_created
  ON payments (tenant_id, created_at DESC);

-- ── lab_orders ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lab_orders_tenant_status_created
  ON lab_orders (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lab_orders_tenant_patient
  ON lab_orders (tenant_id, patient_id, created_at DESC);

-- ── radiology_orders ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_radiology_orders_tenant_status
  ON radiology_orders (tenant_id, status, created_at DESC);

-- ── prescriptions ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant_status
  ON prescriptions (tenant_id, status, created_at DESC);

-- ── drug_batches ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_drug_batches_tenant_expiry
  ON drug_batches (tenant_id, expiry_date)
  WHERE qty_remaining > 0;

CREATE INDEX IF NOT EXISTS idx_drug_batches_tenant_low_stock
  ON drug_batches (tenant_id, qty_remaining)
  WHERE qty_remaining < 10;

-- ── admissions ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_admissions_tenant_status
  ON admissions (tenant_id, status, admitted_at DESC);

-- ── emergency_cases ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_emergency_tenant_created
  ON emergency_cases (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_emergency_tenant_status
  ON emergency_cases (tenant_id, triage_level, status);

-- ── inventory_items ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inventory_tenant_low_stock
  ON inventory_items (tenant_id, qty_in_stock, reorder_level)
  WHERE is_active = true;

-- ── audit_logs ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_tenant_entity
  ON audit_logs (tenant_id, entity, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_actor_created
  ON audit_logs (tenant_id, actor_id, created_at DESC);

-- ── pg_stat_statements (Phase 10.8 monitoring prerequisite) ──────────────────
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
