-- ============================================================
-- Fix: tenant_id missing in SECURITY DEFINER RPCs
-- ============================================================
-- Phase 9 added tenant_id NOT NULL to all tables, but two RPCs
-- that were written before Phase 9 still INSERT without tenant_id:
--   1. claim_bed_and_admit → admissions
--   2. dispense_drug       → dispenses
-- Both are SECURITY DEFINER; auth.uid() / current_tenant_id() are
-- still available inside them because session JWT is preserved.
-- ============================================================

-- ---- 1. claim_bed_and_admit (Phase 2) ----

CREATE OR REPLACE FUNCTION claim_bed_and_admit(
  p_admission_id uuid,
  p_patient_id   uuid,
  p_doctor_id    uuid,
  p_bed_id       uuid,
  p_reason       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ward_id   uuid;
  v_tenant_id uuid := current_tenant_id();
BEGIN
  UPDATE beds SET status = 'occupied'
  WHERE id = p_bed_id AND status = 'available'
  RETURNING ward_id INTO v_ward_id;

  IF v_ward_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bed is no longer available');
  END IF;

  INSERT INTO admissions (id, tenant_id, patient_id, admitting_doctor_id, ward_id, bed_id, reason, status)
  VALUES (p_admission_id, v_tenant_id, p_patient_id, p_doctor_id, v_ward_id, p_bed_id, p_reason, 'admitted');

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_bed_and_admit(uuid, uuid, uuid, uuid, text) TO authenticated;

-- ---- 2. dispense_drug (Phase 3) ----

CREATE OR REPLACE FUNCTION dispense_drug(
  p_dispense_id      uuid,
  p_patient_id       uuid,
  p_prescription_id  uuid,
  p_drug_id          uuid,
  p_batch_id         uuid,
  p_qty              int,
  p_price_snapshot   numeric,
  p_dispensed_by     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid := current_tenant_id();
BEGIN
  UPDATE drug_batches
  SET qty_available = qty_available - p_qty
  WHERE id = p_batch_id
    AND qty_available >= p_qty
    AND expiry > CURRENT_DATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient stock or batch expired');
  END IF;

  INSERT INTO dispenses (id, tenant_id, patient_id, prescription_id, drug_id, drug_batch_id, qty,
                         price_snapshot, billing_status, dispensed_by)
  VALUES (p_dispense_id, v_tenant_id, p_patient_id, p_prescription_id, p_drug_id, p_batch_id, p_qty,
          p_price_snapshot, 'unbilled', p_dispensed_by);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION dispense_drug(uuid, uuid, uuid, uuid, uuid, int, numeric, uuid) TO authenticated;
