-- Form F has to stand on its own.
--
-- 0209 added gravida, para and abortions so Report II could print the full
-- "Gravida, Para, Living Children, Abortion" column, and filled them from the
-- ANC record when the form is opened.
--
-- That assumed every woman having a scan has an antenatal record here. Most do
-- not: she may be referred from outside for the scan alone, or walk in to a
-- centre that does no antenatal care, or the scan may be her first contact
-- with the hospital at all. Across the live tenants there are ten women and
-- one ANC record between them.
--
-- So the column would have printed "-, -, -, 0" — a blank column on a
-- statutory return, which is the offence rather than an untidy sheet. The
-- fields were there and nothing could fill them.
--
-- Form F is a self-contained legal document. It should not depend on another
-- record existing, so the sonologist can now type them and the gate insists.
-- He is asking her these questions anyway while she is on the couch.

CREATE OR REPLACE FUNCTION form_f_completeness_gate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  missing text[] := '{}';
  chk  CONSTANT text := 'Form F cannot be completed — ';
BEGIN
  IF NEW.status <> 'complete' THEN RETURN NEW; END IF;

  -- Section A
  IF NEW.clinic_name       IS NULL OR trim(NEW.clinic_name) = ''      THEN missing := array_append(missing, 'clinic name (1)'); END IF;
  IF NEW.clinic_address    IS NULL OR trim(NEW.clinic_address) = ''   THEN missing := array_append(missing, 'clinic address (1)'); END IF;
  IF NEW.clinic_reg_no     IS NULL OR trim(NEW.clinic_reg_no) = ''    THEN missing := array_append(missing, 'PC&PNDT registration number (2)'); END IF;
  IF NEW.patient_name      IS NULL OR trim(NEW.patient_name) = ''     THEN missing := array_append(missing, 'patient name (3)'); END IF;
  IF NEW.patient_age_years IS NULL                                     THEN missing := array_append(missing, 'patient age (3)'); END IF;
  IF NEW.living_children_total IS NULL                                 THEN missing := array_append(missing, 'number of living children (4)'); END IF;

  -- Report II quotes G, P, L, A for every scan. Zero is a legitimate answer
  -- to all four; NULL is a blank column.
  IF NEW.gravida   IS NULL THEN missing := array_append(missing, 'gravida — G'); END IF;
  IF NEW.para      IS NULL THEN missing := array_append(missing, 'para — P'); END IF;
  IF NEW.abortions IS NULL THEN missing := array_append(missing, 'abortions — A'); END IF;

  IF NEW.relation_name     IS NULL OR trim(NEW.relation_name) = ''    THEN missing := array_append(missing, 'husband''s/father''s name (5)'); END IF;
  IF NEW.relation_type     IS NULL                                     THEN missing := array_append(missing, 'relation (5)'); END IF;
  IF NEW.address_text      IS NULL OR trim(NEW.address_text) = ''     THEN missing := array_append(missing, 'full postal address (6)'); END IF;

  IF NOT NEW.is_self_referral
     AND (NEW.referred_by_name IS NULL OR trim(NEW.referred_by_name) = '') THEN
    missing := array_append(missing, 'who referred her, or mark it a self-referral (7)');
  END IF;
  IF NEW.is_self_referral
     AND (NEW.self_referral_note IS NULL OR trim(NEW.self_referral_note) = '') THEN
    missing := array_append(missing, 'the self-referral note with indications (7b)');
  END IF;

  IF NEW.lmp IS NULL AND NEW.weeks_of_pregnancy IS NULL THEN
    missing := array_append(missing, 'last menstrual period or weeks of pregnancy (8)');
  END IF;

  -- Section B
  IF NEW.performed_by_name   IS NULL OR trim(NEW.performed_by_name) = ''   THEN missing := array_append(missing, 'doctor performing the scan (9)'); END IF;
  IF NEW.performed_by_reg_no IS NULL OR trim(NEW.performed_by_reg_no) = '' THEN missing := array_append(missing, 'that doctor''s registration number (9)'); END IF;
  IF NEW.usg_indications IS NULL OR array_length(NEW.usg_indications, 1) IS NULL THEN
    missing := array_append(missing, 'at least one indication for the scan (10)');
  END IF;
  IF NEW.procedure_type IS NULL THEN missing := array_append(missing, 'procedure carried out (11)'); END IF;
  IF NEW.declaration_obtained_on IS NULL THEN missing := array_append(missing, 'date the woman''s declaration was taken (12)'); END IF;
  IF NEW.procedure_date          IS NULL THEN missing := array_append(missing, 'date of the procedure (13)'); END IF;
  IF NEW.result_text IS NULL OR trim(NEW.result_text) = '' THEN missing := array_append(missing, 'result of the scan (14)'); END IF;

  -- Section D
  IF NOT NEW.woman_declaration_signed THEN
    missing := array_append(missing, 'the woman''s declaration that she does not want to know the sex (Section D)');
  END IF;
  IF NEW.woman_thumb_impression
     AND (NEW.witness_name IS NULL OR trim(NEW.witness_name) = '') THEN
    missing := array_append(missing, 'the name of the person identifying her thumb impression (Section D)');
  END IF;
  IF NOT NEW.doctor_declaration_signed THEN
    missing := array_append(missing, 'the doctor''s declaration that the sex was neither detected nor disclosed (Section D)');
  END IF;
  IF NEW.doctor_declaration_reg_no IS NULL OR trim(NEW.doctor_declaration_reg_no) = '' THEN
    missing := array_append(missing, 'the declaring doctor''s registration number (Section D)');
  END IF;

  -- Section C
  IF NEW.is_invasive THEN
    IF NEW.invasive_performed_by IS NULL OR trim(NEW.invasive_performed_by) = '' THEN
      missing := array_append(missing, 'doctor performing the invasive procedure (17)'); END IF;
    IF NEW.invasive_indications IS NULL OR array_length(NEW.invasive_indications, 1) IS NULL THEN
      missing := array_append(missing, 'indication for the invasive procedure (19)'); END IF;
    IF NEW.form_g_consent_on IS NULL THEN
      missing := array_append(missing, 'date consent was taken in Form G (20)'); END IF;
    IF NEW.invasive_procedures IS NULL OR array_length(NEW.invasive_procedures, 1) IS NULL THEN
      missing := array_append(missing, 'which invasive procedure was carried out (21)'); END IF;
    IF NEW.invasive_result IS NULL OR trim(NEW.invasive_result) = '' THEN
      missing := array_append(missing, 'result of the invasive procedure (24)'); END IF;
    IF NEW.invasive_procedure_date IS NULL THEN
      missing := array_append(missing, 'date of the invasive procedure (25)'); END IF;
  END IF;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION '%', chk || array_to_string(missing, '; ')
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
    NEW.completed_by := COALESCE(NEW.completed_by, auth.uid());
  END IF;
  RETURN NEW;
END $$;
