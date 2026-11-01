-- F-35. admitPatient counted active admissions in TypeScript and then admitted:
--
--   const { count } = await supabase.from('admissions')
--     .select('id', { count:'exact', head:true })
--     .eq('patient_id', patient_id).eq('status','admitted')
--   if ((count ?? 0) > 0) return { success:false, … }
--
-- Two concurrent admissions of the same patient to DIFFERENT beds both read
-- zero and both succeeded — each claiming its own bed, so the bed-level
-- compare-and-set inside claim_bed_and_admit did not help. The check was also
-- absent from the direct-OT path, which inserts the admission row directly.
--
-- One patient cannot be in two beds, so this belongs in the database.
-- Verified before creating it: zero patients currently hold more than one
-- 'admitted' row, so the index builds. Only 'admitted' and 'discharged' exist
-- in the column today, so the predicate covers exactly the active state.
CREATE UNIQUE INDEX IF NOT EXISTS idx_admissions_one_active_per_patient
  ON public.admissions (patient_id)
  WHERE status = 'admitted';

COMMENT ON INDEX public.idx_admissions_one_active_per_patient IS
  'A patient can hold at most one admitted admission. Enforced here because the TypeScript check in admitPatient is a read-then-write and cannot see a concurrent insert.';

-- With the index in place, claim_bed_and_admit must not leave a bed occupied by
-- an admission that was refused. The bed claim and the insert now sit in one
-- inner block with an exception handler, so catching the unique violation rolls
-- the bed back to 'available' as well — a plpgsql EXCEPTION block is a
-- subtransaction, and only statements inside it are undone, which is precisely
-- why the UPDATE has to be inside it rather than above it.
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
