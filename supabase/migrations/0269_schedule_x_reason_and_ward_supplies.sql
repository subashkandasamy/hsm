-- The register records WHY a Schedule X medicine was supplied, and ward
-- supplies are registered too.
--
-- 1. A reason. h1_register (0167) copies who, what, how much and which doctor,
--    but not why. For Schedule X every supply must be justifiable, so the
--    pharmacist enters a short reason ("pain", "fever") when supplying one —
--    the same words KMCH writes in its paper ledger. The reason travels on the
--    supply row (dispenses / pharmacy_sale_items / ipd_pharmacy_requests
--    .supply_reason) and the register trigger copies it in.
--    Required for X by the application, NOT by the database: refusing here
--    would block an X supply made by code deployed before this migration.
--
-- 2. Ward supplies. The register trigger fires on `dispenses` only. Medicines
--    supplied to an admitted patient go through ipd_pharmacy_requests and never
--    reached the register — a Schedule H1 or X supply to a ward was simply not
--    recorded. A second trigger now writes those entries, on the moment the
--    request is marked dispensed (the same moment the MTP draft uses, 0263).
--    Guarded like 0263: a register failure is logged, never allowed to stop a
--    patient's medicine leaving the pharmacy.
--
-- 3. dispense_drug (0239) takes p_reason, DEFAULT NULL, so every existing call
--    still works. The old signature is dropped first so PostgREST's
--    named-argument call cannot be ambiguous.

ALTER TABLE dispenses             ADD COLUMN IF NOT EXISTS supply_reason text;
ALTER TABLE pharmacy_sale_items   ADD COLUMN IF NOT EXISTS supply_reason text;
ALTER TABLE ipd_pharmacy_requests ADD COLUMN IF NOT EXISTS supply_reason text;

COMMENT ON COLUMN dispenses.supply_reason IS
  'Why this medicine was supplied, in the pharmacist''s words. Required by the application for Schedule X; copied into h1_register.reason.';
COMMENT ON COLUMN pharmacy_sale_items.supply_reason IS
  'Reason for supply entered at the counter (Schedule X). Passed to dispense_drug when the sale is handed over.';
COMMENT ON COLUMN ipd_pharmacy_requests.supply_reason IS
  'Reason for supply entered when a ward request is dispensed (Schedule X). Copied into h1_register.reason.';

ALTER TABLE h1_register ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE h1_register ADD COLUMN IF NOT EXISTS ipd_request_id uuid REFERENCES ipd_pharmacy_requests(id) ON DELETE SET NULL;

COMMENT ON COLUMN h1_register.reason IS 'Why it was supplied (Schedule X requires one). NULL on entries made before 0269.';
COMMENT ON COLUMN h1_register.ipd_request_id IS 'Set for a supply to an admitted patient (ward), instead of dispense_id.';

-- One entry per ward supply, so a retry cannot double-enter it.
CREATE UNIQUE INDEX IF NOT EXISTS h1_register_ipd_request ON h1_register (ipd_request_id) WHERE ipd_request_id IS NOT NULL;

-- ── dispense_drug: carries the reason ──────────────────────────────────────
DROP FUNCTION IF EXISTS public.dispense_drug(uuid, uuid, uuid, uuid, uuid, uuid, integer, numeric, uuid);

CREATE OR REPLACE FUNCTION public.dispense_drug(
  p_dispense_id uuid, p_patient_id uuid, p_prescription_id uuid, p_drug_id uuid,
  p_drug_master_id uuid, p_batch_id uuid, p_qty integer, p_price_snapshot numeric,
  p_dispensed_by uuid, p_reason text DEFAULT NULL)
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
                         drug_batch_id, qty, price_snapshot, billing_status, dispensed_by, supply_reason)
  VALUES (p_dispense_id, v_tenant_id, p_patient_id, p_prescription_id,
          p_drug_id, p_drug_master_id,
          p_batch_id, p_qty, p_price_snapshot, 'unbilled', p_dispensed_by,
          nullif(btrim(p_reason), ''));

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.dispense_drug(uuid, uuid, uuid, uuid, uuid, uuid, integer, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispense_drug(uuid, uuid, uuid, uuid, uuid, uuid, integer, numeric, uuid, text) TO authenticated, service_role;

-- ── log_h1_supply (0168) + the reason ──────────────────────────────────────
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
    dispense_id, supplied_by, reason
  ) VALUES (
    NEW.tenant_id, v_next, (NEW.dispensed_at AT TIME ZONE 'Asia/Kolkata')::date, upper(v_schedule),
    NEW.patient_id, coalesce(v_patient.full_name, 'Unknown'), v_patient.uhid, v_patient.address,
    v_prescriber, coalesce(v_drug, 'Unknown'), v_brand, v_batch, NEW.qty,
    NEW.id, NEW.dispensed_by, NEW.supply_reason
  )
  ON CONFLICT (dispense_id) WHERE dispense_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── Ward supplies ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_h1_ward_supply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule   text;
  v_drug       text;
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

  BEGIN
    SELECT p.id, p.full_name, p.uhid, p.address INTO v_patient
      FROM admissions a JOIN patients p ON p.id = a.patient_id
     WHERE a.id = NEW.admission_id;

    -- The doctor who ordered it; failing that, the admitting doctor; failing
    -- that, whoever supplied it — the same fall-back as log_h1_supply.
    SELECT pr.full_name INTO v_prescriber
      FROM ipd_medication_orders o JOIN profiles pr ON pr.id = o.ordered_by
     WHERE o.id = NEW.order_id;
    IF v_prescriber IS NULL THEN
      SELECT pr.full_name INTO v_prescriber
        FROM admissions a JOIN profiles pr ON pr.id = a.admitting_doctor_id
       WHERE a.id = NEW.admission_id;
    END IF;
    IF v_prescriber IS NULL THEN
      SELECT pr.full_name INTO v_prescriber FROM profiles pr WHERE pr.id = NEW.dispensed_by;
    END IF;

    SELECT coalesce(max(entry_no), 0) + 1 INTO v_next FROM h1_register WHERE tenant_id = NEW.tenant_id;

    INSERT INTO h1_register (
      tenant_id, entry_no, supplied_on, schedule,
      patient_id, patient_name, patient_uhid, patient_address,
      prescriber_name, drug_name, brand_name, batch_no, qty,
      ipd_request_id, supplied_by, reason
    ) VALUES (
      NEW.tenant_id, v_next, (NEW.dispensed_at AT TIME ZONE 'Asia/Kolkata')::date, upper(v_schedule),
      v_patient.id, coalesce(v_patient.full_name, 'Unknown'), v_patient.uhid, v_patient.address,
      v_prescriber, coalesce(v_drug, NEW.item_name, 'Unknown'), NULL, NULL, ceil(coalesce(NEW.quantity, 0))::integer,
      NEW.id, NEW.dispensed_by, NEW.supply_reason
    )
    ON CONFLICT (ipd_request_id) WHERE ipd_request_id IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'H1/X register entry for ward supply % was not written: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION log_h1_ward_supply() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_ipd_requests_h1_register ON ipd_pharmacy_requests;
CREATE TRIGGER trg_ipd_requests_h1_register
  AFTER UPDATE OF dispensed_at ON ipd_pharmacy_requests
  FOR EACH ROW
  WHEN (OLD.dispensed_at IS NULL AND NEW.dispensed_at IS NOT NULL)
  EXECUTE FUNCTION log_h1_ward_supply();

NOTIFY pgrst, 'reload schema';
