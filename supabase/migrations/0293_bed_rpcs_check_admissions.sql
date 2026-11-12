-- BUG-055 (E2E 12 Nov 2026): ICU bed I1 was given to a second patient. Its
-- own flag said 'available' while an admitted patient was still in it, and
-- every bed RPC trusted the flag alone. Each now also refuses a bed that an
-- admitted patient is lying in; transfer_bed no longer frees a bed somebody
-- else is still in. Bodies otherwise unchanged from 0245 / 0239 / 0291.
--
-- No data is changed. The screens already treat such a bed as occupied
-- (getWardBoard, listAvailableBeds).

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

  BEGIN
    UPDATE beds SET status = 'occupied'
    WHERE id = p_bed_id AND status = 'available'
      AND tenant_id = v_tenant_id                 -- the bed must be ours (F-46)
      -- and nobody admitted is lying in it, whatever its flag says (BUG-055)
      AND NOT EXISTS (SELECT 1 FROM admissions a WHERE a.bed_id = p_bed_id AND a.status = 'admitted')
    RETURNING ward_id INTO v_ward_id;

    IF v_ward_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Bed is no longer available');
    END IF;

    INSERT INTO admissions (id, tenant_id, patient_id, admitting_doctor_id, ward_id, bed_id, reason, status)
    VALUES (p_admission_id, v_tenant_id, p_patient_id, p_doctor_id, v_ward_id, p_bed_id, p_reason, 'admitted');
  EXCEPTION
    WHEN unique_violation THEN
      -- The bed UPDATE above is inside this block, so it is rolled back too and
      -- the bed stays available for whoever actually needs it.
      RETURN jsonb_build_object('ok', false, 'error',
        'This patient is already admitted. Discharge the existing admission before admitting again.');
  END;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

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
    AND NOT EXISTS (SELECT 1 FROM admissions a WHERE a.bed_id = p_new_bed_id AND a.status = 'admitted')
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

  -- Never free a bed another admitted patient is still in.
  UPDATE beds SET status = 'available'
  WHERE id = p_old_bed_id AND tenant_id = v_tenant_id
    AND NOT EXISTS (SELECT 1 FROM admissions a WHERE a.bed_id = p_old_bed_id AND a.status = 'admitted' AND a.tenant_id = v_tenant_id);

  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_admission_to_bed(
  p_admission_id uuid, p_ward_id uuid, p_bed_id uuid, p_slot text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid := current_tenant_id();
  v_old_bed   uuid;
  v_old_temp  boolean;
  v_status    text;
  v_temp      boolean;
  v_new_bed   uuid;
  v_slot      text := nullif(btrim(coalesce(p_slot, '')), '');
  v_n         int;
BEGIN
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hospital context for this request');
  END IF;
  IF coalesce(current_active_role(), '') NOT IN ('admin', 'doctor', 'nurse', 'receptionist') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not allowed');
  END IF;

  SELECT a.bed_id, a.status, w.is_temp INTO v_old_bed, v_status, v_old_temp
    FROM admissions a LEFT JOIN wards w ON w.id = a.ward_id
   WHERE a.id = p_admission_id AND a.tenant_id = v_tenant_id
   FOR UPDATE OF a;
  IF NOT FOUND OR v_status <> 'admitted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admission not active');
  END IF;
  SELECT is_temp INTO v_temp FROM wards WHERE id = p_ward_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ward not found');
  END IF;

  IF p_bed_id IS NULL THEN
    -- A slot in a temp ward, made now
    IF NOT v_temp THEN RETURN jsonb_build_object('ok', false, 'error', 'Please select a bed'); END IF;
    IF v_slot IS NULL THEN
      SELECT count(*) + 1 INTO v_n FROM beds WHERE ward_id = p_ward_id AND tenant_id = v_tenant_id;
      WHILE EXISTS (SELECT 1 FROM beds WHERE ward_id = p_ward_id AND bed_no = 'Slot-' || v_n) LOOP v_n := v_n + 1; END LOOP;
      v_slot := 'Slot-' || v_n;
    ELSIF EXISTS (SELECT 1 FROM beds WHERE ward_id = p_ward_id AND bed_no = left(v_slot, 40)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'That slot name is already used in this ward');
    END IF;
    v_new_bed := gen_random_uuid();
    INSERT INTO beds (id, tenant_id, ward_id, bed_no, status) VALUES (v_new_bed, v_tenant_id, p_ward_id, left(v_slot, 40), 'occupied');
  ELSE
    UPDATE beds SET status = 'occupied'
     WHERE id = p_bed_id AND ward_id = p_ward_id AND tenant_id = v_tenant_id AND status = 'available'
       AND NOT EXISTS (SELECT 1 FROM admissions a WHERE a.bed_id = p_bed_id AND a.status = 'admitted' AND a.id <> p_admission_id)
    RETURNING id INTO v_new_bed;
    IF v_new_bed IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Bed is no longer available — please choose another');
    END IF;
  END IF;

  UPDATE admissions SET ward_id = p_ward_id, bed_id = v_new_bed, direct_ot = false WHERE id = p_admission_id;

  -- The old bed: a temp slot nobody else ever used goes; anything else is freed —
  -- never one another admitted patient is lying in.
  IF v_old_bed IS NOT NULL AND v_old_bed <> v_new_bed THEN
    IF coalesce(v_old_temp, false) AND NOT EXISTS (SELECT 1 FROM admissions WHERE bed_id = v_old_bed) THEN
      DELETE FROM beds WHERE id = v_old_bed AND tenant_id = v_tenant_id;
    ELSE
      UPDATE beds SET status = 'available'
       WHERE id = v_old_bed AND tenant_id = v_tenant_id
         AND NOT EXISTS (SELECT 1 FROM admissions WHERE bed_id = v_old_bed AND status = 'admitted' AND tenant_id = v_tenant_id);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'bed_id', v_new_bed);
END;
$function$;
