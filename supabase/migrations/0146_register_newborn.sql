-- Register a live-born baby as a patient, once. The baby row is locked so two
-- people pressing "Register" together get the same patient (patients cannot be
-- deleted, so a loser-cleans-up approach would leave a duplicate).
CREATE OR REPLACE FUNCTION register_newborn_patient(p_baby_id uuid, p_name text)
RETURNS TABLE (out_patient_id uuid, out_uhid text, out_created boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  b      record;
  m      record;
  v_id   uuid;
  v_uhid text;
BEGIN
  SELECT db.id, db.baby_patient_id, db.born_at, db.sex, db.outcome, d.patient_id AS mother_id
    INTO b
    FROM delivery_babies db JOIN deliveries d ON d.id = db.delivery_id
   WHERE db.id = p_baby_id
     FOR UPDATE OF db;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Baby not found' USING ERRCODE = 'P0002';
  END IF;

  IF b.baby_patient_id IS NOT NULL THEN
    RETURN QUERY SELECT b.baby_patient_id, (SELECT p.uhid FROM patients p WHERE p.id = b.baby_patient_id), false;
    RETURN;
  END IF;
  IF b.outcome <> 'live_birth' THEN
    RAISE EXCEPTION 'Only a live-born baby can be registered as a patient' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Name is required' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.full_name, p.phone, p.address INTO m FROM patients p WHERE p.id = b.mother_id;
  v_id   := gen_random_uuid();
  v_uhid := get_next_uhid();
  INSERT INTO patients (id, uhid, tenant_id, full_name, dob, gender, phone, address,
                        emergency_contact_name, emergency_contact_phone, created_by)
  VALUES (v_id, v_uhid, current_tenant_id(), trim(p_name), (b.born_at AT TIME ZONE 'Asia/Kolkata')::date,
          CASE WHEN b.sex = 'indeterminate' THEN 'other' ELSE b.sex END,
          m.phone, m.address, m.full_name, m.phone, auth.uid());
  UPDATE delivery_babies SET baby_patient_id = v_id WHERE id = p_baby_id;

  RETURN QUERY SELECT v_id, v_uhid, true;
END;
$$;

REVOKE ALL ON FUNCTION register_newborn_patient(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION register_newborn_patient(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
