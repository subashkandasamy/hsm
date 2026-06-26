-- ============================================================================
-- Phase 10.2 — Composite Index Audit
-- ============================================================================
-- Column names verified against each table's CREATE TABLE definition.
-- ============================================================================

-- Enable pg_trgm for fast ILIKE / fuzzy patient-name searches
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ── patients ──────────────────────────────────────────────────────────────────
-- (tenant_id, uhid) UNIQUE already exists from phase 9
-- full_name is the actual column name (not "name")
CREATE INDEX IF NOT EXISTS idx_patients_tenant_name_trgm
  ON patients USING gin (full_name extensions.gin_trgm_ops);

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

-- ── payments ─────────────────────────────────────────────────────────────────
-- payments uses received_at (not created_at)
CREATE INDEX IF NOT EXISTS idx_payments_tenant_received
  ON payments (tenant_id, received_at DESC);

-- ── lab_orders ────────────────────────────────────────────────────────────────
-- lab_orders uses ordered_at (not created_at)
CREATE INDEX IF NOT EXISTS idx_lab_orders_tenant_status
  ON lab_orders (tenant_id, status, ordered_at DESC);

CREATE INDEX IF NOT EXISTS idx_lab_orders_tenant_patient
  ON lab_orders (tenant_id, patient_id, ordered_at DESC);

-- ── radiology_orders ──────────────────────────────────────────────────────────
-- radiology_orders uses ordered_at (not created_at)
CREATE INDEX IF NOT EXISTS idx_radiology_orders_tenant_status
  ON radiology_orders (tenant_id, status, ordered_at DESC);

-- ── prescriptions ────────────────────────────────────────────────────────────
-- prescriptions has: id, visit_id, drug_name, dosage, frequency, duration,
-- instructions, tenant_id — no status or created_at columns
CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant_visit
  ON prescriptions (tenant_id, visit_id);

-- ── drug_batches ─────────────────────────────────────────────────────────────
-- drug_batches uses: expiry (not expiry_date), qty_available (not qty_remaining)
CREATE INDEX IF NOT EXISTS idx_drug_batches_tenant_expiry
  ON drug_batches (tenant_id, expiry)
  WHERE qty_available > 0;

CREATE INDEX IF NOT EXISTS idx_drug_batches_tenant_low_stock
  ON drug_batches (tenant_id, qty_available)
  WHERE qty_available < 10;

-- ── admissions ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_admissions_tenant_status
  ON admissions (tenant_id, status, admitted_at DESC);

-- ── emergency_cases ───────────────────────────────────────────────────────────
-- emergency_cases uses arrived_at (not created_at)
CREATE INDEX IF NOT EXISTS idx_emergency_tenant_arrived
  ON emergency_cases (tenant_id, arrived_at DESC);

CREATE INDEX IF NOT EXISTS idx_emergency_tenant_triage_status
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
