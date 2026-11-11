-- 0281 — Discharge frees the bed, whoever presses Discharge.
--
-- Found testing 0280 on demo, 11 Nov 2026: a doctor discharged two patients and
-- both beds stayed "occupied". dischargePatient freed the bed with the user's
-- own client, and beds is writable only by admin and nurse (beds_tenant_write,
-- 0010) — so for a doctor or receptionist the UPDATE matched no row, raised no
-- error, and the bed was lost to the ward board until an admin noticed. The
-- same is why aes-health's bed T1 was still occupied two months after its
-- patient went home.
--
-- Admission and transfer never had this problem because they claim beds
-- through SECURITY DEFINER functions (claim_bed_and_admit, transfer_bed). This
-- is the third one, for the way out.
--
-- Temp-ward slots were meant to be deleted at discharge, but the discharged
-- admission still points at its slot (admissions.bed_id, no ON DELETE), so the
-- delete could never succeed. The slot is released like any other bed and the
-- admission keeps the record of where the patient lay.

CREATE OR REPLACE FUNCTION public.release_admission_bed(p_admission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid := current_tenant_id();
  v_bed_id    uuid;
  v_status    text;
  v_freed     int;
BEGIN
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hospital context for this request');
  END IF;

  SELECT bed_id, status INTO v_bed_id, v_status
    FROM admissions WHERE id = p_admission_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Admission not found');
  END IF;
  -- Only a closed stay gives its bed back; an admitted patient keeps it.
  IF v_status = 'admitted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The patient is still admitted');
  END IF;
  IF v_bed_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'freed', false);
  END IF;

  -- Never free a bed somebody else is lying in.
  UPDATE beds SET status = 'available'
   WHERE id = v_bed_id AND tenant_id = v_tenant_id AND status = 'occupied'
     AND NOT EXISTS (SELECT 1 FROM admissions a
                      WHERE a.bed_id = v_bed_id AND a.status = 'admitted' AND a.tenant_id = v_tenant_id);
  GET DIAGNOSTICS v_freed = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'freed', v_freed > 0);
END;
$function$;

-- Changes a shared resource, so never PUBLIC or anon (0238, 0259).
REVOKE ALL ON FUNCTION public.release_admission_bed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_admission_bed(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
