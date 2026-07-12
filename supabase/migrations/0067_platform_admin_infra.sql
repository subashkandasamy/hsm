-- ============================================================
-- 0067: Platform Admin Infrastructure
-- 1. Add 'purged' to tenants.status allowed values
-- 2. Create platform_admin_audit table (separate from tenant audit_logs)
-- 3. Create purge_tenant_data() stored procedure
-- ============================================================
-- Pre-flight analysis (run against live DB 2026-07-11):
--   • tenants.status current values: trial(1), cancelled(1) — no 'purged' rows exist
--   • platform_admin_audit: does NOT yet exist — clean CREATE
--   • All purge target tables verified to have tenant_id (uuid) except:
--       ward_room_types.tenant_id  → TEXT (requires cast in DELETE)
--   • auth_otp_codes CRITICAL: profile_id → profiles ON DELETE NO ACTION
--       Must be deleted BEFORE profiles or profiles DELETE will fail
--   • patient_allergies: patient_id → patients ON DELETE CASCADE (auto-handled)
--   • device_push_tokens: profile_id → profiles ON DELETE CASCADE (auto-handled)
--   • tariffs, tenant_profiles, ward_room_types: missing from original purge — added
-- ============================================================

-- ── 1. Allow 'purged' status on tenants ──────────────────────────────────────
-- Impact: purely additive; existing rows (trial/cancelled) unaffected; table lock is
-- sub-millisecond on 2-row table.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('trial','active','past_due','suspended','cancelled','purged'));

-- ── 2. Platform admin audit log ──────────────────────────────────────────────
-- Separate from tenant audit_logs — no tenant_id required, not partitioned.
-- Platform admins can read; service key (SECURITY DEFINER functions) can write.
CREATE TABLE IF NOT EXISTS platform_admin_audit (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id         UUID        NOT NULL REFERENCES auth.users(id),
  action           TEXT        NOT NULL,
  target_tenant_id UUID        REFERENCES tenants(id) ON DELETE SET NULL,
  meta             JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paa_created ON platform_admin_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paa_admin   ON platform_admin_audit (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paa_tenant  ON platform_admin_audit (target_tenant_id, created_at DESC);

ALTER TABLE platform_admin_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paa_read" ON platform_admin_audit FOR SELECT
  USING (EXISTS (SELECT 1 FROM platform_admins WHERE id = auth.uid()));

-- Insert is done only via SECURITY DEFINER functions (service role bypasses RLS)
-- No direct INSERT policy needed for regular users.

-- ── 3. purge_tenant_data() ───────────────────────────────────────────────────
-- Deletes ALL rows belonging to a tenant in FK-safe order.
-- Marks the tenant row as 'purged' (preserves it for audit trail).
-- Does NOT delete auth.users — profiles are removed but login credentials remain.
-- Called exclusively via service key.
--
-- Verified delete order against live FK graph (2026-07-11):
--   • audit_logs, bill_items, lab_order_items, visits, appointments are PARTITIONED —
--     DELETE on the parent propagates to all partitions automatically (PG 10+).
--   • auth_otp_codes MUST come before profiles (NO ACTION FK on profile_id).
--   • ward_room_types.tenant_id is TEXT — use p_tenant_id::text in WHERE clause.
--   • patient_allergies, device_push_tokens auto-cascade from patients/profiles.
--   • ot_team_members has no tenant_id — deleted via ot_schedule_id subquery.
CREATE OR REPLACE FUNCTION purge_tenant_data(p_tenant_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN

  -- ── OT: consumables and team members before schedules ─────────────────────
  DELETE FROM ot_consumables  WHERE tenant_id = p_tenant_id;
  DELETE FROM ot_team_members WHERE ot_schedule_id IN (
    SELECT id FROM ot_schedules WHERE tenant_id = p_tenant_id
  );

  -- ── IPD treatment / medication — all before admissions ────────────────────
  DELETE FROM ipd_pharmacy_requests       WHERE tenant_id = p_tenant_id;
  DELETE FROM ipd_medication_orders       WHERE tenant_id = p_tenant_id;
  DELETE FROM ipd_admin_schedule          WHERE tenant_id = p_tenant_id;
  DELETE FROM ipd_progress_notes          WHERE tenant_id = p_tenant_id;
  DELETE FROM admission_nurse_assignments WHERE tenant_id = p_tenant_id;
  DELETE FROM advance_deposit_requests    WHERE tenant_id = p_tenant_id;

  -- ── Billing leaves — before bills ─────────────────────────────────────────
  DELETE FROM bill_items                  WHERE tenant_id = p_tenant_id;
  DELETE FROM payments                    WHERE tenant_id = p_tenant_id;
  DELETE FROM admission_advance_refunds   WHERE tenant_id = p_tenant_id;
  DELETE FROM insurance_claims            WHERE tenant_id = p_tenant_id;
  DELETE FROM admission_advances          WHERE tenant_id = p_tenant_id;

  -- ── Lab / radiology order children ────────────────────────────────────────
  DELETE FROM lab_order_items             WHERE tenant_id = p_tenant_id;
  DELETE FROM radiology_orders            WHERE tenant_id = p_tenant_id;

  -- ── Pharmacy POS ──────────────────────────────────────────────────────────
  DELETE FROM pharmacy_sale_items         WHERE tenant_id = p_tenant_id;
  DELETE FROM pharmacy_sales              WHERE tenant_id = p_tenant_id;

  -- ── Blood bank leaves ─────────────────────────────────────────────────────
  DELETE FROM blood_issues                WHERE tenant_id = p_tenant_id;

  -- ── Pharmacy / dental / patient attachments ────────────────────────────────
  DELETE FROM dispenses                   WHERE tenant_id = p_tenant_id;
  DELETE FROM dental_treatments           WHERE tenant_id = p_tenant_id;
  DELETE FROM dental_recalls              WHERE tenant_id = p_tenant_id;
  DELETE FROM patient_dental_chart        WHERE tenant_id = p_tenant_id;
  DELETE FROM patient_documents           WHERE tenant_id = p_tenant_id;
  -- patient_allergies: patient_id→patients CASCADE (auto on patients delete)
  -- but explicit here for safety and completeness
  DELETE FROM patient_allergies           WHERE tenant_id = p_tenant_id;

  -- ── Stock ─────────────────────────────────────────────────────────────────
  DELETE FROM po_items                    WHERE tenant_id = p_tenant_id;
  DELETE FROM stock_movements             WHERE tenant_id = p_tenant_id;
  DELETE FROM drug_batches                WHERE tenant_id = p_tenant_id;

  -- ── Mid-level: bills, orders, schedules ───────────────────────────────────
  DELETE FROM bills                       WHERE tenant_id = p_tenant_id;
  DELETE FROM lab_orders                  WHERE tenant_id = p_tenant_id;
  DELETE FROM ot_schedules                WHERE tenant_id = p_tenant_id;
  DELETE FROM prescriptions               WHERE tenant_id = p_tenant_id;

  -- ── Blood bank parents ────────────────────────────────────────────────────
  DELETE FROM blood_units                 WHERE tenant_id = p_tenant_id;
  DELETE FROM blood_requests              WHERE tenant_id = p_tenant_id;
  DELETE FROM blood_donors                WHERE tenant_id = p_tenant_id;

  -- ── OPD visits (partitioned — DELETE on parent covers all partitions) ──────
  DELETE FROM visits                      WHERE tenant_id = p_tenant_id;

  -- ── Insurance parents ─────────────────────────────────────────────────────
  DELETE FROM insurance_policies          WHERE tenant_id = p_tenant_id;

  -- ── Admissions — after ALL IPD / OT / billing / blood tables ─────────────
  DELETE FROM admissions                  WHERE tenant_id = p_tenant_id;

  -- ── Infrastructure freed by admissions ────────────────────────────────────
  DELETE FROM beds                        WHERE tenant_id = p_tenant_id;
  DELETE FROM ot_rooms                    WHERE tenant_id = p_tenant_id;

  -- ── Pharmacy infrastructure ────────────────────────────────────────────────
  DELETE FROM purchase_orders             WHERE tenant_id = p_tenant_id;
  DELETE FROM drugs                       WHERE tenant_id = p_tenant_id;
  DELETE FROM inventory_items             WHERE tenant_id = p_tenant_id;
  DELETE FROM suppliers                   WHERE tenant_id = p_tenant_id;

  -- ── Appointments + emergency (partitioned — DELETE on parent covers all) ───
  DELETE FROM appointments                WHERE tenant_id = p_tenant_id;
  DELETE FROM emergency_cases             WHERE tenant_id = p_tenant_id;

  -- ── HR ────────────────────────────────────────────────────────────────────
  DELETE FROM duty_roster                 WHERE tenant_id = p_tenant_id;
  DELETE FROM staff_attendance            WHERE tenant_id = p_tenant_id;
  DELETE FROM staff_profiles              WHERE tenant_id = p_tenant_id;

  -- ── Catalog / config ──────────────────────────────────────────────────────
  DELETE FROM lab_tests_catalog           WHERE tenant_id = p_tenant_id;
  DELETE FROM radiology_catalog           WHERE tenant_id = p_tenant_id;
  DELETE FROM procedure_tariffs           WHERE tenant_id = p_tenant_id;
  DELETE FROM ipd_custom_charges          WHERE tenant_id = p_tenant_id;
  DELETE FROM ipd_billing_config          WHERE tenant_id = p_tenant_id;
  DELETE FROM tariffs                     WHERE tenant_id = p_tenant_id;

  -- ── Notifications / audit ─────────────────────────────────────────────────
  DELETE FROM notifications               WHERE tenant_id = p_tenant_id;
  DELETE FROM audit_logs                  WHERE tenant_id = p_tenant_id;

  -- ── CRITICAL: auth_otp_codes BEFORE profiles ──────────────────────────────
  -- profile_id → profiles(id) ON DELETE NO ACTION.
  -- If this is skipped, DELETE FROM profiles will fail with FK violation.
  DELETE FROM auth_otp_codes              WHERE tenant_id = p_tenant_id;

  -- ── Top-level tenant data ─────────────────────────────────────────────────

  -- Patients (after all clinical tables + patient_allergies explicit delete above)
  -- patient_allergies, device_push_tokens cascade from here automatically
  DELETE FROM patients                    WHERE tenant_id = p_tenant_id;

  -- Profiles — device_push_tokens cascades on DELETE (safe)
  DELETE FROM profiles                    WHERE tenant_id = p_tenant_id;

  -- tenant_profiles: tenant_id→tenants CASCADE fires only on tenant row DELETE.
  -- Since we UPDATE (not DELETE) the tenant row, must explicitly purge.
  DELETE FROM tenant_profiles             WHERE tenant_id = p_tenant_id;

  -- Ward hierarchy — must delete wards before ward_room_types
  -- (wards.room_type_id → ward_room_types FK)
  DELETE FROM wards                       WHERE tenant_id = p_tenant_id;

  -- ward_room_types.tenant_id is TEXT — cast the UUID param
  DELETE FROM ward_room_types             WHERE tenant_id = p_tenant_id::text;

  -- Departments (after wards and profiles)
  DELETE FROM departments                 WHERE tenant_id = p_tenant_id;

  -- ── Subscription: mark cancelled, keep row for billing history ────────────
  UPDATE subscriptions SET status = 'cancelled'
    WHERE tenant_id = p_tenant_id;

  -- ── Mark tenant as purged — row is preserved for audit trail ─────────────
  UPDATE tenants SET status = 'purged' WHERE id = p_tenant_id;

END;
$$;

-- Only service role should call this (SECURITY DEFINER already enforces it server-side)
REVOKE ALL ON FUNCTION purge_tenant_data(UUID) FROM PUBLIC;
