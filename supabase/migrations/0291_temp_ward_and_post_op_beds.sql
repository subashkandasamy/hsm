-- 0291 — Temp-ward admission and the post-op move work for a doctor too.
--
-- Found in the 11 Nov flow audit: admitting into a temp (overflow) ward and
-- moving a patient to a ward after surgery wrote `beds` with the user's own
-- client. beds is writable only by admin and nurse (beds_tenant_write, 0010),
-- while admitting and moving need ipd:write — admin and doctor. So for a
-- doctor the temp slot insert failed outright, and the post-op bed claim
-- matched no row and said "Bed is no longer available" while the old bed was
-- never freed. A normal admission (claim_bed_and_admit), a bed transfer
-- (transfer_bed) and discharge (release_admission_bed, 0281) already go
-- through SECURITY DEFINER functions; these are the last two bed writes.
--
-- Both: this hospital only, clinical / front-desk roles only, everything in
-- one transaction (a refused admission leaves no slot behind). The same audit
-- found admitting never closed the day's appointment when a doctor admitted
-- (appointments needs registration access) — the third function here.

-- ── Admit into a temp-ward slot ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admit_to_temp_slot(
  p_admission_id uuid, p_patient_id uuid, p_doctor_id uuid, p_ward_id uuid, p_slot text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid := current_tenant_id();
  v_slot      text := nullif(btrim(coalesce(p_slot, '')), '');
  v_bed_id    uuid := gen_random_uuid();
  v_n         int;
BEGIN
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hospital context for this request');
  END IF;
  IF coalesce(current_active_role(), '') NOT IN ('admin', 'doctor', 'nurse', 'receptionist') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not allowed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM wards WHERE id = p_ward_id AND tenant_id = v_tenant_id AND is_temp) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Choose a temporary ward of this hospital');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM patients WHERE id = p_patient_id AND tenant_id = v_tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Patient not found');
  END IF;
  IF v_slot IS NULL THEN
    -- The next free Slot-N (a freed slot may have left a gap or a clash)
    SELECT count(*) + 1 INTO v_n FROM beds WHERE ward_id = p_ward_id AND tenant_id = v_tenant_id;
    WHILE EXISTS (SELECT 1 FROM beds WHERE ward_id = p_ward_id AND bed_no = 'Slot-' || v_n) LOOP v_n := v_n + 1; END LOOP;
    v_slot := 'Slot-' || v_n;
  ELSIF EXISTS (SELECT 1 FROM beds WHERE ward_id = p_ward_id AND bed_no = left(v_slot, 40)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That slot name is already used in this ward');
  END IF;

  BEGIN
    INSERT INTO beds (id, tenant_id, ward_id, bed_no, status)
    VALUES (v_bed_id, v_tenant_id, p_ward_id, left(v_slot, 40), 'occupied');
    INSERT INTO admissions (id, tenant_id, patient_id, admitting_doctor_id, ward_id, bed_id, reason, status)
    VALUES (p_admission_id, v_tenant_id, p_patient_id, p_doctor_id, p_ward_id, v_bed_id, p_reason, 'admitted');
  EXCEPTION
    WHEN unique_violation THEN
      -- The slot insert is inside this block, so it is undone too.
      RETURN jsonb_build_object('ok', false, 'error',
        'This patient is already admitted. Discharge the existing admission before admitting again.');
  END;
  RETURN jsonb_build_object('ok', true, 'bed_id', v_bed_id, 'slot', v_slot);
END;
$function$;

-- ── Move an admitted patient to a ward bed or a temp slot (after surgery) ────
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

-- ── Admitting closes the day's appointment, whoever admits ────────────────────
-- appointments is updatable only with registration access, so a doctor's
-- admission left the patient "booked" / "checked in" on the OPD list.
CREATE OR REPLACE FUNCTION public.close_appointments_on_admit(p_admission_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid := current_tenant_id();
  v_patient   uuid;
  v_day       date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_n         integer;
BEGIN
  IF v_tenant_id IS NULL OR coalesce(current_active_role(), '') NOT IN ('admin', 'doctor', 'nurse', 'receptionist') THEN
    RETURN 0;
  END IF;
  -- Only for a patient this hospital has just admitted.
  SELECT patient_id INTO v_patient FROM admissions
   WHERE id = p_admission_id AND tenant_id = v_tenant_id AND status = 'admitted';
  IF NOT FOUND THEN RETURN 0; END IF;
  UPDATE appointments SET status = 'done'
   WHERE tenant_id = v_tenant_id AND patient_id = v_patient AND status IN ('checked_in', 'booked')
     AND scheduled_at >= (v_day::timestamp AT TIME ZONE 'Asia/Kolkata')
     AND scheduled_at <  ((v_day + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.close_appointments_on_admit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_appointments_on_admit(uuid) TO authenticated, service_role;

-- Change shared resources, so never PUBLIC or anon (0238, 0259).
REVOKE ALL ON FUNCTION public.admit_to_temp_slot(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admit_to_temp_slot(uuid, uuid, uuid, uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.move_admission_to_bed(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_admission_to_bed(uuid, uuid, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
