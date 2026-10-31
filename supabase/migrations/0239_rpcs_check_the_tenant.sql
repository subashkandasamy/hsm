-- Five SECURITY DEFINER functions located a row by id alone and never checked
-- which hospital it belonged to. RLS is off inside a SECURITY DEFINER function,
-- so a foreign UUID was enough to occupy another hospital's bed, move their
-- patient, decrement their pharmacy stock, consume a unit from their blood
-- fridge, or burn through their patient numbering — each writing a child row
-- carrying the caller's tenant while pointing at somebody else's parent.
--
-- save_lab_analyte_results already does this check and explains why:
--   "A connector belonging to one hospital may not write onto another's order,
--    however it arrived at the id."
-- The pattern was understood here. It had been applied once and omitted five
-- times. This applies it to the other five.
--
-- Researched before changing anything:
--   * beds, drug_batches, blood_units, admissions hold no NULL tenant_id
--     (38 / 12 / 8 / 7 rows, zero nulls), so no legitimate row is excluded.
--   * claim_bed_and_admit, transfer_bed, dispense_drug and issue_blood_unit are
--     every one of them called with the *user* client, so current_tenant_id()
--     is always present for them and a strict check is safe.
--   * get_next_uhid_for is different and nearly caused a regression:
--     patientPortal.ts:839 calls it with the SERVICE client during patient
--     self-registration, where current_tenant_id() is NULL. A strict check
--     would have broken portal signup, so it tolerates a NULL caller tenant
--     and only refuses a mismatch.

-- ── 1. Admission ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_bed_and_admit(
  p_admission_id uuid, p_patient_id uuid, p_doctor_id uuid, p_bed_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ward_id   uuid;
  v_tenant_id uuid := current_tenant_id();
BEGIN
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hospital context for this request');
  END IF;

  UPDATE beds SET status = 'occupied'
  WHERE id = p_bed_id AND status = 'available'
    AND tenant_id = v_tenant_id                 -- the bed must be ours
  RETURNING ward_id INTO v_ward_id;

  IF v_ward_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bed is no longer available');
  END IF;

  INSERT INTO admissions (id, tenant_id, patient_id, admitting_doctor_id, ward_id, bed_id, reason, status)
  VALUES (p_admission_id, v_tenant_id, p_patient_id, p_doctor_id, v_ward_id, p_bed_id, p_reason, 'admitted');

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ── 2. Bed transfer ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_bed(
  p_admission_id uuid, p_old_bed_id uuid, p_new_bed_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_new_ward_id uuid;
  v_tenant_id   uuid := current_tenant_id();
  v_moved       int;
BEGIN
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hospital context for this request');
  END IF;

  UPDATE beds SET status = 'occupied'
  WHERE id = p_new_bed_id AND status = 'available' AND tenant_id = v_tenant_id
  RETURNING ward_id INTO v_new_ward_id;

  IF v_new_ward_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target bed is no longer available');
  END IF;

  UPDATE admissions
  SET bed_id = p_new_bed_id, ward_id = v_new_ward_id
  WHERE id = p_admission_id AND tenant_id = v_tenant_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- Put the claimed bed back rather than stranding it occupied with nobody in it.
  IF v_moved = 0 THEN
    UPDATE beds SET status = 'available' WHERE id = p_new_bed_id AND tenant_id = v_tenant_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Admission not found');
  END IF;

  UPDATE beds SET status = 'available'
  WHERE id = p_old_bed_id AND tenant_id = v_tenant_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ── 3. Pharmacy ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispense_drug(
  p_dispense_id uuid, p_patient_id uuid, p_prescription_id uuid, p_drug_id uuid,
  p_drug_master_id uuid, p_batch_id uuid, p_qty integer, p_price_snapshot numeric,
  p_dispensed_by uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_tenant_id uuid := current_tenant_id();
BEGIN
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hospital context for this request');
  END IF;

  UPDATE drug_batches
  SET qty_available = qty_available - p_qty
  WHERE id = p_batch_id
    AND tenant_id = v_tenant_id                 -- the stock must be ours
    AND qty_available >= p_qty
    AND expiry > CURRENT_DATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient stock or batch expired');
  END IF;

  INSERT INTO dispenses (id, tenant_id, patient_id, prescription_id, drug_id, drug_master_id,
                         drug_batch_id, qty, price_snapshot, billing_status, dispensed_by)
  VALUES (p_dispense_id, v_tenant_id, p_patient_id, p_prescription_id,
          p_drug_id, p_drug_master_id,
          p_batch_id, p_qty, p_price_snapshot, 'unbilled', p_dispensed_by);

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ── 4. Blood issue — also the F-45 fix ──────────────────────────────────────
-- The INSERT omitted tenant_id, which is NOT NULL with no default, so every
-- issue raised 23502 at the last statement and rolled the whole thing back.
-- blood_issues held 0 rows: a unit had never been issued through Uyirly.
-- Every clinical check below is unchanged — screening, component, cross-match,
-- and the atomic claim that re-checks screening.
CREATE OR REPLACE FUNCTION public.issue_blood_unit(
  p_issue_id uuid, p_request_id uuid, p_blood_unit_id uuid, p_patient_id uuid,
  p_price_snapshot numeric, p_issued_by uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_unit  blood_units%ROWTYPE;
  v_req   blood_requests%ROWTYPE;
  v_xm    boolean;
  v_issued_count int;
  v_tenant_id uuid := current_tenant_id();
BEGIN
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hospital context for this request');
  END IF;

  SELECT * INTO v_unit FROM blood_units
   WHERE id = p_blood_unit_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Blood unit not found');
  END IF;
  IF v_unit.screening_status <> 'passed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unit not screening-passed — complete TTI screening before issue');
  END IF;

  SELECT * INTO v_req FROM blood_requests
   WHERE id = p_request_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Blood request not found');
  END IF;
  IF v_unit.component <> v_req.component THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Component mismatch');
  END IF;

  SELECT compatible INTO v_xm FROM blood_crossmatches
   WHERE request_id = p_request_id AND blood_unit_id = p_blood_unit_id
   ORDER BY crossmatched_at DESC LIMIT 1;
  IF v_xm IS NULL OR v_xm = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No compatible cross-match on record for this unit — cross-match before issue');
  END IF;

  UPDATE blood_units
  SET    status = 'issued'
  WHERE  id = p_blood_unit_id
    AND  tenant_id = v_tenant_id
    AND  status IN ('available','reserved')
    AND  expiry >= CURRENT_DATE
    AND  screening_status = 'passed'
  RETURNING * INTO v_unit;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unit unavailable, already issued, or expired');
  END IF;

  INSERT INTO blood_issues (id, tenant_id, request_id, blood_unit_id, patient_id,
                            price_snapshot, billing_status, issued_by)
  VALUES (p_issue_id, v_tenant_id, p_request_id, p_blood_unit_id, p_patient_id,
          p_price_snapshot, 'unbilled', p_issued_by);

  SELECT COUNT(*) INTO v_issued_count FROM blood_issues WHERE request_id = p_request_id;
  IF v_issued_count >= v_req.units_required THEN
    UPDATE blood_requests SET status = 'issued'
     WHERE id = p_request_id AND tenant_id = v_tenant_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ── 5. UHID counter — NULL-tolerant on purpose ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_next_uhid_for(p_tenant_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_year int := extract(year from now())::int;
  v_next int;
  v_caller uuid := current_tenant_id();
BEGIN
  -- A signed-in user may only draw their own hospital's numbers. A NULL caller
  -- tenant is the service role — patient self-registration on the portal
  -- (patientPortal.ts) runs headless and legitimately passes the tenant in.
  IF v_caller IS NOT NULL AND p_tenant_id <> v_caller THEN
    RAISE EXCEPTION 'Cannot draw a UHID for another hospital'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO uhid_counter (tenant_id, year, last_val) VALUES (p_tenant_id, v_year, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_val = uhid_counter.last_val + 1
  RETURNING last_val INTO v_next;
  RETURN tenant_doc_prefix(p_tenant_id) || '-UH-' || v_year || '-' || lpad(v_next::text, 5, '0');
END;
$function$;
