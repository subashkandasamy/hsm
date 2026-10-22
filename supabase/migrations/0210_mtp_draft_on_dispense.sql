-- A termination nobody remembered to write down.
--
-- The MTP register depends on somebody opening a record. Report V, sitting
-- beside it, is counted automatically from the pharmacy. So a hospital that
-- forgets one case files a drug count that disagrees with its case count —
-- which is the exact discrepancy the Act is built to find, produced by
-- forgetfulness rather than intent.
--
-- The fix is the same shape as the analyzer connector: do not rely on anyone
-- remembering to start something. When the abortion drugs leave the pharmacy,
-- open a draft and put it on the unfinished list. A doctor completing a record
-- that already exists is a different proposition from a doctor remembering to
-- create one.
--
-- A DRAFT, never a completed record. The system knows a drug was dispensed; it
-- does not know a termination happened, who performed it, or on what ground.
-- Guessing any of that onto a statutory return would be worse than the gap.

CREATE OR REPLACE FUNCTION mtp_draft_on_dispense() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_patient uuid;
  v_tracked boolean;
  v_exists  uuid;
  v_serial  text;
  v_anc     record;
  v_pat     record;
BEGIN
  -- Only drugs this hospital has put on the monthly return. A hospital that
  -- has not set them up gets no drafts, which is correct: it also gets no
  -- Report V to disagree with.
  SELECT EXISTS (
    SELECT 1 FROM mtp_tracked_drugs t
     WHERE t.tenant_id = NEW.tenant_id AND t.is_active
       AND ((t.drug_master_id IS NOT NULL AND t.drug_master_id = NEW.drug_master_id)
         OR (t.drug_id        IS NOT NULL AND t.drug_id        = NEW.drug_id))
  ) INTO v_tracked;
  IF NOT v_tracked THEN RETURN NEW; END IF;

  SELECT s.patient_id INTO v_patient
    FROM pharmacy_sales s WHERE s.id = NEW.pharmacy_sale_id;
  IF v_patient IS NULL THEN RETURN NEW; END IF;

  -- One draft per woman per week. The combipack is dispensed as a course and
  -- a second strip days later is the same termination, not another one.
  SELECT id INTO v_exists FROM mtp_records
   WHERE tenant_id = NEW.tenant_id AND patient_id = v_patient
     AND created_at > now() - interval '7 days';
  IF v_exists IS NOT NULL THEN RETURN NEW; END IF;

  SELECT full_name, relation_type, relation_name, address, district, state, pincode, phone, dob
    INTO v_pat FROM patients WHERE id = v_patient;
  SELECT lmp, gravida, para, living, abortions INTO v_anc
    FROM anc_records WHERE patient_id = v_patient ORDER BY created_at DESC LIMIT 1;

  v_serial := get_next_mtp_no(NEW.tenant_id);

  INSERT INTO mtp_records (
    tenant_id, serial_no, patient_id, status,
    patient_name, patient_age_years, relation_type, relation_name,
    address_text, district, state, pincode, contact_no,
    lmp, gravida, para, living, abortions,
    living_male, living_female,
    method, drug_master_id, drug_id
  ) VALUES (
    NEW.tenant_id, v_serial, v_patient, 'draft',
    v_pat.full_name,
    CASE WHEN v_pat.dob IS NULL THEN NULL
         ELSE GREATEST(0, (CURRENT_DATE - v_pat.dob) / 365)::int END,
    v_pat.relation_type, v_pat.relation_name,
    v_pat.address, v_pat.district, v_pat.state, v_pat.pincode, v_pat.phone,
    v_anc.lmp, v_anc.gravida, v_anc.para, v_anc.living, v_anc.abortions,
    (SELECT count(*) FROM patient_children c
      WHERE c.patient_id = v_patient AND c.is_living AND c.sex = 'male'),
    (SELECT count(*) FROM patient_children c
      WHERE c.patient_id = v_patient AND c.is_living AND c.sex = 'female'),
    -- The only thing dispensing actually tells us.
    'medical', NEW.drug_master_id, NEW.drug_id
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mtp_draft_on_dispense ON pharmacy_sale_items;
CREATE TRIGGER trg_mtp_draft_on_dispense
  AFTER INSERT ON pharmacy_sale_items
  FOR EACH ROW EXECUTE FUNCTION mtp_draft_on_dispense();

COMMENT ON FUNCTION mtp_draft_on_dispense() IS
  'Opens a draft MTP record when an abortion drug on the monthly return is dispensed. A draft only — the pharmacy knows a drug left the shelf, not that a termination happened.';
