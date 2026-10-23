-- The three rules that make the Accident Register worth keeping.
--
-- They live in the database rather than the form, for the reason Form F's gate
-- does: a rule the UI alone enforces is a rule a stale tab writes around, and
-- this record is produced in court.
--
--   1. Completeness — the columns a court will ask about must have answers.
--   2. "108" is not a name — the Madras High Court's rule, enforced.
--   3. Intimation is an event — no boolean to tick, and the clock is visible.
--
-- Plus the two that apply to any evidential record: locked once signed,
-- never deleted.

-- ── 1 and 2: the completeness gate ─────────────────────────────────────────
--
-- A trigger rather than a CHECK, so the refusal can name the missing column.
-- "violates check constraint mlc_complete_check" helps nobody standing in a
-- casualty at three in the morning.
--
-- A draft is deliberately unconstrained. The entry is started when the patient
-- arrives and finished when the doctor has examined them, and the hours in
-- between are exactly when the hospital is busy keeping them alive. Nothing
-- here should force a choice between the form and the patient.

CREATE OR REPLACE FUNCTION mlc_completeness_gate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  missing text[] := '{}';
  v_brought text;
  chk CONSTANT text := 'This medico-legal entry cannot be completed — ';
BEGIN
  IF NEW.status <> 'complete' THEN RETURN NEW; END IF;

  -- The patient, as the sheet records them.
  IF NEW.patient_name IS NULL OR trim(NEW.patient_name) = '' THEN
    missing := array_append(missing, 'patient name (or "unknown", with the identification marks)'); END IF;
  IF NEW.patient_sex IS NULL THEN
    missing := array_append(missing, 'sex'); END IF;
  IF NEW.patient_age IS NULL THEN
    missing := array_append(missing, 'age'); END IF;
  IF NEW.patient_address IS NULL OR trim(NEW.patient_address) = '' THEN
    missing := array_append(missing, 'address'); END IF;

  -- Both marks, because one mark identifies nobody. This is what makes an
  -- unidentified patient identifiable to a relative days later, and it is the
  -- field most often left blank.
  IF NEW.identification_mark_1 IS NULL OR trim(NEW.identification_mark_1) = '' THEN
    missing := array_append(missing, 'first identification mark'); END IF;
  IF NEW.identification_mark_2 IS NULL OR trim(NEW.identification_mark_2) = '' THEN
    missing := array_append(missing, 'second identification mark'); END IF;

  -- The incident.
  IF NEW.mlc_types IS NULL OR array_length(NEW.mlc_types, 1) IS NULL THEN
    missing := array_append(missing, 'what makes this case medico-legal'); END IF;
  IF NEW.alleged_cause IS NULL OR trim(NEW.alleged_cause) = '' THEN
    missing := array_append(missing, 'the alleged cause, in the informant''s own words'); END IF;
  IF NEW.place_of_occurrence IS NULL OR trim(NEW.place_of_occurrence) = '' THEN
    missing := array_append(missing, 'place of occurrence'); END IF;
  IF NEW.arrived_at IS NULL THEN
    missing := array_append(missing, 'date and time of arrival'); END IF;

  -- The examination. The grade may be deferred, but it may not be absent: a
  -- blank here is the most consequential omission in the document, because
  -- simple or grievous decides what the accused is charged with.
  IF NEW.injury_natures IS NULL OR array_length(NEW.injury_natures, 1) IS NULL THEN
    missing := array_append(missing, 'nature of the injuries'); END IF;
  IF NEW.injury_details IS NULL OR trim(NEW.injury_details) = '' THEN
    missing := array_append(missing, 'description of the injuries — site, size and shape of each'); END IF;
  IF NEW.injury_grade IS NULL THEN
    missing := array_append(missing, 'whether the injuries are simple or grievous (mark it deferred if it is too early to say)'); END IF;
  -- A deferred grade must say what it is waiting for — an X-ray, an opinion,
  -- observation — or it reads as an evasion.
  IF NEW.injury_grade = 'deferred'
     AND (NEW.injury_grade_note IS NULL OR trim(NEW.injury_grade_note) = '') THEN
    missing := array_append(missing, 'what the opinion on grading is waiting for'); END IF;

  -- The doctor. The duty under BNSS 397 is personal, so the record names them
  -- and their council registration rather than the hospital.
  IF NEW.examined_by_name IS NULL OR trim(NEW.examined_by_name) = '' THEN
    missing := array_append(missing, 'the examining doctor''s name'); END IF;
  IF NEW.examined_by_reg_no IS NULL OR trim(NEW.examined_by_reg_no) = '' THEN
    missing := array_append(missing, 'the examining doctor''s registration number'); END IF;
  IF NEW.first_aid_given IS NULL OR trim(NEW.first_aid_given) = '' THEN
    missing := array_append(missing, 'the first aid or treatment given'); END IF;
  IF NEW.disposal IS NULL THEN
    missing := array_append(missing, 'how the patient was disposed of'); END IF;

  -- ── The Madras High Court rule ───────────────────────────────────────────
  --
  -- Ramasubramanian v. State of Tamil Nadu: the hospital must record the name
  -- and particulars of the person who brought the victim. The habit the court
  -- was addressing is writing the ambulance down and nothing else — and "108"
  -- is the commonest entry in any Indian casualty register.
  --
  -- So an ambulance service is not an answer by itself. Somebody travelled
  -- with that patient, and if genuinely nobody did, the entry must say so in
  -- words rather than hide it behind a number.
  v_brought := lower(regexp_replace(COALESCE(NEW.brought_by_name, ''), '[^a-zA-Z0-9]', '', 'g'));

  IF v_brought = '' THEN
    missing := array_append(missing,
      'who brought the patient in — the person''s name, not only the ambulance');
  ELSIF v_brought = ANY (ARRAY[
          '108','102','104','ambulance','108ambulance','ambulance108','emri','emri108',
          '108emri','govtambulance','governmentambulance','privateambulance','ambulanceservice',
          'police','policeman','constable','self','na','nil','unknown','none','public',
          'bystander','bystanders','passerby','passersby','stranger','others','other']) THEN
    missing := array_append(missing,
      format('"%s" alone is not a person. Record the name and particulars of whoever brought the patient — '
             'the Madras High Court requires it. If truly nobody accompanied them, write that, '
             'with the ambulance crew or officer''s name and badge number', NEW.brought_by_name));
  ELSIF NEW.brought_by_relation IS NULL OR trim(NEW.brought_by_relation) = '' THEN
    missing := array_append(missing, 'how that person is related to the patient');
  END IF;

  -- A dying declaration that was thought necessary must say what came of it.
  -- The flag exists so the decision is made; this makes sure it was followed.
  IF NEW.dying_declaration_needed
     AND (NEW.dying_declaration_note IS NULL OR trim(NEW.dying_declaration_note) = '') THEN
    missing := array_append(missing,
      'what happened about the dying declaration — who was informed and whether it was recorded');
  END IF;

  -- ── 3: intimation is an event, and it must have happened ────────────────
  --
  -- The duty under BNSS 397 is to inform the police immediately. An entry
  -- cannot be signed off as complete while that has not been done: a finished
  -- register entry with no intimation against it describes an offence by the
  -- hospital.
  IF NOT EXISTS (SELECT 1 FROM mlc_police_intimations WHERE mlc_id = NEW.id) THEN
    missing := array_append(missing,
      'the police intimation — record which station was informed, by whom and when, before signing this off');
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

DROP TRIGGER IF EXISTS trg_mlc_completeness ON mlc_records;
CREATE TRIGGER trg_mlc_completeness
  BEFORE INSERT OR UPDATE ON mlc_records
  FOR EACH ROW EXECUTE FUNCTION mlc_completeness_gate();

-- ── Locking ────────────────────────────────────────────────────────────────
--
-- Once complete this is a signed medico-legal document, very likely already
-- copied to a police station. It is not edited; it is amended, by a new row
-- that points at it and says why, with both preserved — because a register
-- whose contents can quietly diverge from the copy the police hold is worse
-- than no register.
--
-- service_role is exempt so purge_tenant_data can still remove a tenant who
-- has left or asked to be erased. The retention duty binds the hospital, not
-- us, and a hospital session is never service_role.

CREATE OR REPLACE FUNCTION mlc_lock_completed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN RETURN NEW; END IF;

  IF OLD.status = 'complete' THEN
    IF NEW.status = 'amended' AND OLD.status <> 'amended' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'Medico-legal entry % is complete and cannot be edited. Raise an amendment instead — the original stays on the record.',
      OLD.ar_no USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mlc_lock ON mlc_records;
CREATE TRIGGER trg_mlc_lock
  BEFORE UPDATE ON mlc_records
  FOR EACH ROW EXECUTE FUNCTION mlc_lock_completed();

-- A completed AR entry is never deleted. A missing serial in an accident
-- register is a question no hospital wants put to it on a witness stand.
CREATE OR REPLACE FUNCTION mlc_no_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN RETURN OLD; END IF;

  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION
      'Medico-legal entry % cannot be deleted — it is part of the hospital''s accident register.',
      OLD.ar_no USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_mlc_no_delete ON mlc_records;
CREATE TRIGGER trg_mlc_no_delete
  BEFORE DELETE ON mlc_records
  FOR EACH ROW EXECUTE FUNCTION mlc_no_delete();

-- An intimation, once recorded, is not unrecorded. It is the hospital's proof
-- that it discharged a statutory duty, so deleting it destroys the only
-- evidence in the hospital's own favour. A mistake is corrected by recording
-- the correct intimation, and both stay.
CREATE OR REPLACE FUNCTION mlc_intimation_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- The acknowledgement often arrives later than the intimation — an FIR
  -- number the next morning — so that field stays writable, and nothing else.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.station_name    IS DISTINCT FROM OLD.station_name
       OR NEW.method       IS DISTINCT FROM OLD.method
       OR NEW.intimated_at IS DISTINCT FROM OLD.intimated_at
       OR NEW.intimated_by IS DISTINCT FROM OLD.intimated_by
       OR NEW.mlc_id       IS DISTINCT FROM OLD.mlc_id THEN
      RAISE EXCEPTION
        'A police intimation cannot be rewritten. Record a further intimation instead — both stay on the record.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'A police intimation cannot be deleted — it is the hospital''s proof that it informed the police.'
    USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS trg_mlc_intimation_immutable ON mlc_police_intimations;
CREATE TRIGGER trg_mlc_intimation_immutable
  BEFORE UPDATE OR DELETE ON mlc_police_intimations
  FOR EACH ROW EXECUTE FUNCTION mlc_intimation_immutable();

-- ── The clock ──────────────────────────────────────────────────────────────
--
-- Not a rule but the thing that makes the rules visible: for every open
-- medico-legal case, how long the police have been uninformed. The board reads
-- this; it is the difference between a duty the hospital knows it owes and one
-- it discovers at a hearing.

CREATE OR REPLACE FUNCTION get_mlc_pending(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS TABLE (
  emergency_case_id   uuid,
  mlc_id              uuid,
  ar_no               text,
  patient_name        text,
  arrived_at          timestamptz,
  mlc_status          text,
  intimation_count    int,
  first_intimated_at  timestamptz,
  hours_since_arrival numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH v_tenant AS (SELECT COALESCE(p_tenant_id, current_tenant_id()) AS id)
  SELECT
    ec.id,
    m.id,
    m.ar_no,
    COALESCE(m.patient_name, p.full_name),
    ec.arrived_at,
    -- 'none' is a distinct and worse state than 'draft': the case was flagged
    -- medico-legal and nobody has started the register entry at all.
    COALESCE(m.status, 'none'),
    (SELECT count(*)::int FROM mlc_police_intimations i WHERE i.mlc_id = m.id),
    (SELECT min(i.intimated_at) FROM mlc_police_intimations i WHERE i.mlc_id = m.id),
    round(EXTRACT(epoch FROM (now() - ec.arrived_at)) / 3600.0, 1)
  FROM emergency_cases ec
  CROSS JOIN v_tenant t
  LEFT JOIN mlc_records m
    ON m.emergency_case_id = ec.id AND m.status <> 'amended'
  LEFT JOIN patients p ON p.id = ec.patient_id
  WHERE ec.tenant_id = t.id
    AND ec.is_mlc
    AND COALESCE(m.status, 'none') <> 'complete'
  ORDER BY ec.arrived_at;
$$;

COMMENT ON FUNCTION get_mlc_pending(uuid) IS
  'Open medico-legal cases with no completed register entry, and how many hours the police have been uninformed.';
