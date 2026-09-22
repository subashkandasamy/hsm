-- ON CONFLICT against a partial index has to repeat the predicate, or Postgres
-- cannot match it to the index. Without this the trigger raised, and because it
-- runs inside the dispense, the dispense failed with it — so a Schedule H1
-- medicine could not be handed over at all.
CREATE OR REPLACE FUNCTION log_h1_supply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule   text;
  v_drug       text;
  v_brand      text;
  v_batch      text;
  v_patient    record;
  v_prescriber text;
  v_next       integer;
BEGIN
  IF NEW.drug_master_id IS NOT NULL THEN
    SELECT m.schedule, m.name INTO v_schedule, v_drug FROM drug_master m WHERE m.id = NEW.drug_master_id;
  ELSIF NEW.drug_id IS NOT NULL THEN
    SELECT d.schedule, d.name INTO v_schedule, v_drug FROM drugs d WHERE d.id = NEW.drug_id;
  END IF;

  IF upper(coalesce(v_schedule, '')) NOT IN ('H1', 'X') THEN
    RETURN NEW;
  END IF;

  SELECT b.brand_name, b.batch_no INTO v_brand, v_batch
    FROM drug_batches b WHERE b.id = NEW.drug_batch_id;

  SELECT p.full_name, p.uhid, p.address INTO v_patient
    FROM patients p WHERE p.id = NEW.patient_id;

  SELECT pr.full_name INTO v_prescriber
    FROM prescriptions rx
    JOIN visits v ON v.id = rx.visit_id
    JOIN profiles pr ON pr.id = v.doctor_id
   WHERE rx.id = NEW.prescription_id;

  IF v_prescriber IS NULL THEN
    SELECT pr.full_name INTO v_prescriber FROM profiles pr WHERE pr.id = NEW.dispensed_by;
  END IF;

  SELECT coalesce(max(entry_no), 0) + 1 INTO v_next FROM h1_register WHERE tenant_id = NEW.tenant_id;

  INSERT INTO h1_register (
    tenant_id, entry_no, supplied_on, schedule,
    patient_id, patient_name, patient_uhid, patient_address,
    prescriber_name, drug_name, brand_name, batch_no, qty,
    dispense_id, supplied_by
  ) VALUES (
    NEW.tenant_id, v_next, (NEW.dispensed_at AT TIME ZONE 'Asia/Kolkata')::date, upper(v_schedule),
    NEW.patient_id, coalesce(v_patient.full_name, 'Unknown'), v_patient.uhid, v_patient.address,
    v_prescriber, coalesce(v_drug, 'Unknown'), v_brand, v_batch, NEW.qty,
    NEW.id, NEW.dispensed_by
  )
  ON CONFLICT (dispense_id) WHERE dispense_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
