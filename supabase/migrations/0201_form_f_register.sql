-- Form F — the record the PC&PNDT Act is actually enforced through.
--
-- [See proviso to Section 4(3), rule 9(4) and rule 10(1A)], as amended on
-- 4 February 2014. Every ultrasound performed on a pregnant woman needs one,
-- every column filled, kept two years, and copies sent to the Appropriate
-- Authority by the 5th of the following month.
--
-- Courts have held that a blank column here is not a clerical slip — it is the
-- offence. So this schema is built to make an incomplete record impossible to
-- complete rather than merely discouraged, and the gate lives in the database
-- because a form that only the UI validates is a form that a stale tab can
-- write around.
--
-- The Act permits "NA" where something does not apply. The gate therefore
-- demands a VALUE, not a non-empty one: writing "Not Applicable" is compliant,
-- leaving it blank is not.
--
-- ── What is national and what is not ───────────────────────────────────────
--
-- Everything in this file is central law and identical in all 36 states and
-- union territories. The monthly summary sheets that quote from it vary by
-- district, so they are deliberately not modelled here — they will be a
-- rendering of this data, not a reshaping of it.

-- ── The fixed lists the Act prescribes ─────────────────────────────────────
--
-- A reference table rather than strings in code, because the printed form must
-- reproduce the Act's own wording exactly and a developer paraphrasing an
-- indication is how a hospital ends up defending one.

CREATE TABLE IF NOT EXISTS pcpndt_options (
  -- 'usg_indication'      field 10 — the 23 permitted reasons for a scan
  -- 'diagnosis_basis'     field 18
  -- 'invasive_indication' field 19
  -- 'invasive_procedure'  field 21
  -- 'additional_test'     field 23
  kind      text NOT NULL,
  code      text NOT NULL,
  ordinal   int  NOT NULL,
  -- The Act's wording, verbatim. Changing it changes what the hospital is
  -- certifying, so it is seeded here and not edited by tenants.
  label     text NOT NULL,
  -- field 19 groups its indications under A/B/C/D.
  group_label text,
  PRIMARY KEY (kind, code)
);

COMMENT ON TABLE pcpndt_options IS
  'The fixed option lists Form F prescribes. Central law, shared by every tenant, never edited by a hospital.';

INSERT INTO pcpndt_options (kind, code, ordinal, label) VALUES
  ('usg_indication','i',1,'To diagnose intra-uterine and/or ectopic pregnancy and confirm viability.'),
  ('usg_indication','ii',2,'Estimation of gestational age (dating).'),
  ('usg_indication','iii',3,'Detection of number of fetuses and their chorionicity.'),
  ('usg_indication','iv',4,'Suspected pregnancy with IUCD in-situ or suspected pregnancy following contraceptive failure/MTP failure.'),
  ('usg_indication','v',5,'Vaginal bleeding/leaking.'),
  ('usg_indication','vi',6,'Follow-up of cases of abortion.'),
  ('usg_indication','vii',7,'Assessment of cervical canal and diameter of internal os.'),
  ('usg_indication','viii',8,'Discrepancy between uterine size and period of amenorrhea.'),
  ('usg_indication','ix',9,'Any suspected adenexal or uterine pathology/abnormality.'),
  ('usg_indication','x',10,'Detection of chromosomal abnormalities, fetal structural defects and other abnormalities and their follow-up.'),
  ('usg_indication','xi',11,'To evaluate fetal presentation and position.'),
  ('usg_indication','xii',12,'Assessment of liquor amnii.'),
  ('usg_indication','xiii',13,'Preterm labor/preterm premature rupture of membranes.'),
  ('usg_indication','xiv',14,'Evaluation of placental position, thickness, grading and abnormalities (placenta praevia, retro placental haemorrhage, abnormal adherence etc.).'),
  ('usg_indication','xv',15,'Evaluation of umbilical cord – presentation, insertion, nuchal encirclement, number of vessels and presence of true knot.'),
  ('usg_indication','xvi',16,'Evaluation of previous Caesarean Section scars.'),
  ('usg_indication','xvii',17,'Evaluation of fetal growth parameters, fetal weight and fetal well being.'),
  ('usg_indication','xviii',18,'Color flow mapping and duplex Doppler studies.'),
  ('usg_indication','xix',19,'Ultrasound guided procedures such as medical termination of pregnancy, external cephalic version etc. and their follow-up.'),
  ('usg_indication','xx',20,'Adjunct to diagnostic and therapeutic invasive interventions such as chorionic villus sampling (CVS), amniocenteses, fetal blood sampling, fetal skin biopsy, amnio-infusion, intrauterine infusion, placement of shunts etc.'),
  ('usg_indication','xxi',21,'Observation of intra-partum events.'),
  ('usg_indication','xxii',22,'Medical/surgical conditions complicating pregnancy.'),
  ('usg_indication','xxiii',23,'Research/scientific studies in recognized institutions.')
ON CONFLICT (kind, code) DO UPDATE SET label = EXCLUDED.label, ordinal = EXCLUDED.ordinal;

INSERT INTO pcpndt_options (kind, code, ordinal, label) VALUES
  ('diagnosis_basis','clinical',1,'Clinical'),
  ('diagnosis_basis','biochemical',2,'Bio-chemical'),
  ('diagnosis_basis','cytogenetic',3,'Cytogenetic'),
  ('diagnosis_basis','other',4,'Other (e.g. radiological, ultrasonography etc. – specify)')
ON CONFLICT (kind, code) DO UPDATE SET label = EXCLUDED.label;

INSERT INTO pcpndt_options (kind, code, ordinal, label, group_label) VALUES
  ('invasive_indication','a_i',1,'Chromosomal disorders','A. Previous child/children with'),
  ('invasive_indication','a_ii',2,'Metabolic disorders','A. Previous child/children with'),
  ('invasive_indication','a_iii',3,'Congenital anomaly','A. Previous child/children with'),
  ('invasive_indication','a_iv',4,'Mental Disability','A. Previous child/children with'),
  ('invasive_indication','a_v',5,'Haemoglobinopathy','A. Previous child/children with'),
  ('invasive_indication','a_vi',6,'Sex linked disorders','A. Previous child/children with'),
  ('invasive_indication','a_vii',7,'Single gene disorder','A. Previous child/children with'),
  ('invasive_indication','a_viii',8,'Any other (specify)','A. Previous child/children with'),
  ('invasive_indication','b',9,'Advanced maternal age (35 years)',NULL),
  ('invasive_indication','c',10,'Mother/father/sibling has genetic disease (specify)',NULL),
  ('invasive_indication','d',11,'Other (specify)',NULL)
ON CONFLICT (kind, code) DO UPDATE SET label = EXCLUDED.label, group_label = EXCLUDED.group_label;

INSERT INTO pcpndt_options (kind, code, ordinal, label) VALUES
  ('invasive_procedure','amniocentesis',1,'Amniocentesis'),
  ('invasive_procedure','cvs',2,'Chorionic Villi aspiration'),
  ('invasive_procedure','fetal_biopsy',3,'Fetal biopsy'),
  ('invasive_procedure','cordocentesis',4,'Cordocentesis'),
  ('invasive_procedure','other',5,'Any other (specify)'),
  ('additional_test','chromosomal',1,'Chromosomal studies'),
  ('additional_test','biochemical',2,'Biochemical studies'),
  ('additional_test','molecular',3,'Molecular studies'),
  ('additional_test','preimplantation',4,'Pre-implantation gender diagnosis'),
  ('additional_test','other',5,'Any other (specify)')
ON CONFLICT (kind, code) DO UPDATE SET label = EXCLUDED.label;

ALTER TABLE pcpndt_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pcpndt_options_read ON pcpndt_options;
CREATE POLICY pcpndt_options_read ON pcpndt_options FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

-- ── Living children ────────────────────────────────────────────────────────
--
-- Form F field 4 does not ask how many children a woman has. It asks for the
-- age of each living son and each living daughter, separately — because the
-- whole Act turns on whether families with daughters keep trying for a son.
--
-- The Tamil Nadu summary needs the same thing from the other direction:
-- Report III classifies mothers who delivered as primi, with one female child,
-- or with two and above. One table answers both.

CREATE TABLE IF NOT EXISTS patient_children (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  sex        text NOT NULL,
  -- The form accepts an age "in years or months", so a mother who knows her
  -- child is nine months old is not forced to invent a birthday.
  dob        date,
  age_years  int,
  age_months int,
  is_living  boolean NOT NULL DEFAULT true,
  notes      text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_children_sex_check CHECK (sex = ANY (ARRAY['male','female'])),
  CONSTRAINT patient_children_age_check
    CHECK (dob IS NOT NULL OR age_years IS NOT NULL OR age_months IS NOT NULL),
  CONSTRAINT patient_children_years_check  CHECK (age_years  IS NULL OR age_years  BETWEEN 0 AND 60),
  CONSTRAINT patient_children_months_check CHECK (age_months IS NULL OR age_months BETWEEN 0 AND 11)
);

CREATE INDEX IF NOT EXISTS patient_children_patient_idx
  ON patient_children (tenant_id, patient_id) WHERE is_living;

ALTER TABLE patient_children ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_children_tenant_all ON patient_children;
CREATE POLICY patient_children_tenant_all ON patient_children FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

-- ── Which Report I bucket a scan belongs in ────────────────────────────────
--
-- Report I counts every ultrasound the centre did, not only the ones with a
-- Form F behind them — it has columns for male abdomen and cardiac scans,
-- which no pregnant woman generates. A catalogue entry therefore has to say
-- which column it lands in, set once by the hospital.

ALTER TABLE radiology_catalog
  ADD COLUMN IF NOT EXISTS pcpndt_bucket text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'radiology_catalog_pcpndt_bucket_check') THEN
    ALTER TABLE radiology_catalog ADD CONSTRAINT radiology_catalog_pcpndt_bucket_check
      CHECK (pcpndt_bucket IS NULL OR pcpndt_bucket = ANY (ARRAY[
        'male_abdomen','male_cardiac',
        'female_general_abdomen','female_antenatal','female_preconception',
        'female_transvaginal','female_other',
        'not_ultrasound']));
  END IF;
END $$;

COMMENT ON COLUMN radiology_catalog.pcpndt_bucket IS
  'Which column of the monthly PC&PNDT scan count this study falls into. not_ultrasound excludes it entirely.';

-- ── The serial number ──────────────────────────────────────────────────────
--
-- Form F is referred to by its serial, and the monthly summary lists them in
-- order, so a gap is a question a hospital has to answer. Same atomic counter
-- the bill numbers use, keyed by financial year.

CREATE TABLE IF NOT EXISTS form_f_seq (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year      int  NOT NULL,
  last_no   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, year)
);

ALTER TABLE form_f_seq ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS form_f_seq_tenant_all ON form_f_seq;
CREATE POLICY form_f_seq_tenant_all ON form_f_seq FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

CREATE OR REPLACE FUNCTION get_next_form_f_no(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_fy     int  := fy_start_year();
  v_seq    int;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'get_next_form_f_no: tenant_id could not be resolved';
  END IF;
  INSERT INTO form_f_seq (tenant_id, year, last_no) VALUES (v_tenant, v_fy, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = form_f_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  -- Financial year, matching the invoice series, because an inspection covers
  -- a year of records and a hospital should not have to think about which
  -- year a January form belongs to.
  RETURN 'F/' || fy_token() || '/' || lpad(v_seq::text, 5, '0');
END $$;

-- ── The record ─────────────────────────────────────────────────────────────
--
-- Heavily snapshotted, on purpose. A Form F is a legal document, not a view of
-- current data: if the woman has another child next year, last year's form
-- must still say what was true on the day of the scan. So the patient's name,
-- age, address, relation and children are copied in at creation and never
-- joined live. Same for the clinic's registered name and PC&PNDT number,
-- which change when a registration is renewed.

CREATE TABLE IF NOT EXISTS form_f_records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  serial_no   text NOT NULL,
  form_date   date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,

  -- draft    → being filled, incomplete allowed
  -- complete → signed and locked; corrections become an amendment
  -- amended  → superseded by the row that points at it
  status      text NOT NULL DEFAULT 'draft',
  amends_id   uuid REFERENCES form_f_records(id) ON DELETE RESTRICT,
  amend_reason text,

  -- ── Section A: every diagnostic procedure ───────────────────────────────
  clinic_name     text,  -- 1. as registered, not the trading name
  clinic_address  text,  -- 1.
  clinic_reg_no   text,  -- 2. registration under the Act

  patient_id        uuid REFERENCES patients(id) ON DELETE RESTRICT,
  patient_name      text,  -- 3.
  patient_age_years int,   -- 3.

  living_children_total int,      -- 4. zero is a legitimate answer
  children_snapshot     jsonb,    -- 4a/4b. sex and age of each, frozen

  relation_type text,  -- 5. husband/wife/father/mother
  relation_name text,  -- 5.

  address_text text,   -- 6. full postal address
  district     text,   -- 6. read closely by the authority
  state        text,   -- 6.
  pincode      text,   -- 6.
  contact_no   text,   -- 6.

  referred_by_name    text,     -- 7a. doctor or genetic counselling centre
  referred_by_address text,     -- 7a.
  is_self_referral    boolean NOT NULL DEFAULT false,  -- 7b.
  self_referral_note  text,     -- 7b. indications; case papers kept with the form

  lmp                date,  -- 8.
  weeks_of_pregnancy int,   -- 8. either satisfies the field

  -- ── Section B: non-invasive ─────────────────────────────────────────────
  performed_by_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  performed_by_name   text,   -- 9.
  performed_by_reg_no text,   -- 9. medical council registration
  usg_indications     text[], -- 10. codes from pcpndt_options
  usg_indication_note text,   -- 10. where the referral slip says more
  procedure_type      text,   -- 11. ultrasound | other
  procedure_other     text,   -- 11.
  declaration_obtained_on date,  -- 12. MUST be on or before the procedure
  procedure_date          date,  -- 13.
  result_text         text,   -- 14.
  result_conveyed_to  text,   -- 15.
  result_conveyed_on  date,   -- 15.
  mtp_indication      text,   -- 16. any indication for MTP from what was found

  -- ── Section C: invasive, only when one was performed ────────────────────
  is_invasive              boolean NOT NULL DEFAULT false,
  invasive_performed_by    text,    -- 17.
  family_genetic_history   text,    -- 18.
  diagnosis_basis          text[],  -- 18.
  invasive_indications     text[],  -- 19.
  invasive_indication_note text,    -- 19.
  form_g_consent_on        date,    -- 20. consent in Form G
  invasive_procedures      text[],  -- 21.
  invasive_procedure_other text,    -- 21.
  invasive_complications   text,    -- 22.
  additional_tests         text[],  -- 23.
  invasive_result          text,    -- 24.
  invasive_procedure_date  date,    -- 25.
  invasive_conveyed_to     text,    -- 26.
  invasive_conveyed_on     date,    -- 26.
  invasive_mtp_indication  text,    -- 27.

  -- ── Section D: the two declarations ─────────────────────────────────────
  --
  -- These are the heart of the Act. The woman declares she does not want to
  -- know the sex; the doctor declares he neither detected nor disclosed it.
  woman_declaration_signed boolean NOT NULL DEFAULT false,
  woman_thumb_impression   boolean NOT NULL DEFAULT false,
  -- A thumb impression needs an identifying witness, named on the form.
  witness_name     text,
  witness_age      int,
  witness_sex      text,
  witness_relation text,
  witness_address  text,
  witness_contact  text,

  doctor_declaration_signed boolean NOT NULL DEFAULT false,
  doctor_declaration_name   text,
  doctor_declaration_reg_no text,

  -- Which column of the monthly scan count this lands in.
  scan_category text,
  -- The order it came from, when there was one. A scan centre may see a woman
  -- who was never booked through Uyirly, so this is optional by design.
  radiology_order_id uuid REFERENCES radiology_orders(id) ON DELETE SET NULL,

  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  completed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,

  CONSTRAINT form_f_status_check
    CHECK (status = ANY (ARRAY['draft','complete','amended'])),
  CONSTRAINT form_f_serial_key UNIQUE (tenant_id, serial_no),
  CONSTRAINT form_f_relation_check
    CHECK (relation_type IS NULL OR relation_type = ANY (ARRAY['husband','wife','father','mother'])),
  CONSTRAINT form_f_procedure_type_check
    CHECK (procedure_type IS NULL OR procedure_type = ANY (ARRAY['ultrasound','other'])),

  -- The rule that matters most, and the one an inspection looks for: the
  -- woman's declaration is taken BEFORE the scan, never written up after.
  CONSTRAINT form_f_declaration_before_procedure
    CHECK (declaration_obtained_on IS NULL OR procedure_date IS NULL
           OR declaration_obtained_on <= procedure_date),

  -- An amendment must say why. A correction without a reason is indistinguishable
  -- from tampering.
  CONSTRAINT form_f_amend_reason_check
    CHECK (amends_id IS NULL OR (amend_reason IS NOT NULL AND length(trim(amend_reason)) > 0))
);

CREATE INDEX IF NOT EXISTS form_f_tenant_month_idx
  ON form_f_records (tenant_id, procedure_date DESC) WHERE status = 'complete';
CREATE INDEX IF NOT EXISTS form_f_tenant_status_idx
  ON form_f_records (tenant_id, status);
CREATE INDEX IF NOT EXISTS form_f_patient_idx
  ON form_f_records (tenant_id, patient_id);

ALTER TABLE form_f_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS form_f_records_tenant_all ON form_f_records;
CREATE POLICY form_f_records_tenant_all ON form_f_records FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

-- ── The gate ───────────────────────────────────────────────────────────────
--
-- A trigger rather than a CHECK, for two reasons: the rules differ by state
-- (draft may be anything), and a refusal should say WHICH column is missing.
-- "violates check constraint form_f_complete_check" helps nobody standing at
-- a machine with a patient waiting.
--
-- Note what is NOT enforced: that a field is non-empty. The Act expects "NA"
-- or "Not Applicable" written against anything that does not apply, so a
-- value of 'NA' is compliant and a NULL is not. The gate asks for an answer,
-- not for a particular answer.

CREATE OR REPLACE FUNCTION form_f_completeness_gate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  missing text[] := '{}';
  chk  CONSTANT text := 'Form F cannot be completed — ';
BEGIN
  -- A draft is a work in progress and is deliberately unconstrained.
  IF NEW.status <> 'complete' THEN RETURN NEW; END IF;

  -- Section A
  IF NEW.clinic_name       IS NULL OR trim(NEW.clinic_name) = ''      THEN missing := array_append(missing, 'clinic name (1)'); END IF;
  IF NEW.clinic_address    IS NULL OR trim(NEW.clinic_address) = ''   THEN missing := array_append(missing, 'clinic address (1)'); END IF;
  IF NEW.clinic_reg_no     IS NULL OR trim(NEW.clinic_reg_no) = ''    THEN missing := array_append(missing, 'PC&PNDT registration number (2)'); END IF;
  IF NEW.patient_name      IS NULL OR trim(NEW.patient_name) = ''     THEN missing := array_append(missing, 'patient name (3)'); END IF;
  IF NEW.patient_age_years IS NULL                                     THEN missing := array_append(missing, 'patient age (3)'); END IF;
  IF NEW.living_children_total IS NULL                                 THEN missing := array_append(missing, 'number of living children (4)'); END IF;
  IF NEW.relation_name     IS NULL OR trim(NEW.relation_name) = ''    THEN missing := array_append(missing, 'husband''s/father''s name (5)'); END IF;
  IF NEW.relation_type     IS NULL                                     THEN missing := array_append(missing, 'relation (5)'); END IF;
  IF NEW.address_text      IS NULL OR trim(NEW.address_text) = ''     THEN missing := array_append(missing, 'full postal address (6)'); END IF;

  -- 7 is satisfied either way round, but not by neither.
  IF NOT NEW.is_self_referral
     AND (NEW.referred_by_name IS NULL OR trim(NEW.referred_by_name) = '') THEN
    missing := array_append(missing, 'who referred her, or mark it a self-referral (7)');
  END IF;
  IF NEW.is_self_referral
     AND (NEW.self_referral_note IS NULL OR trim(NEW.self_referral_note) = '') THEN
    missing := array_append(missing, 'the self-referral note with indications (7b)');
  END IF;

  -- 8: last menstrual period OR weeks of pregnancy.
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

  -- Section D — the declarations are the point of the whole form.
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

  -- Section C, only when an invasive procedure was actually performed.
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

DROP TRIGGER IF EXISTS trg_form_f_completeness ON form_f_records;
CREATE TRIGGER trg_form_f_completeness
  BEFORE INSERT OR UPDATE ON form_f_records
  FOR EACH ROW EXECUTE FUNCTION form_f_completeness_gate();

-- ── Locking ────────────────────────────────────────────────────────────────
--
-- Once complete, a Form F is a signed legal record. It is not edited; it is
-- amended, by a new row that points at it and says why, with both preserved.
--
-- A hospital will finish a form, spot a typo, and be annoyed by this. The
-- alternative is a register whose contents can differ from the paper already
-- filed with the authority, which is not a register at all.

CREATE OR REPLACE FUNCTION form_f_lock_completed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'complete' THEN
    -- The only permitted transition is being superseded by an amendment.
    IF NEW.status = 'amended' AND OLD.status <> 'amended' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'Form F % is complete and cannot be edited. Raise an amendment instead — the original stays on the record.',
      OLD.serial_no USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_form_f_lock ON form_f_records;
CREATE TRIGGER trg_form_f_lock
  BEFORE UPDATE ON form_f_records
  FOR EACH ROW EXECUTE FUNCTION form_f_lock_completed();

-- A completed Form F is never deleted. Two-year retention is a statutory duty
-- and a missing serial is a question nobody wants to be asked.
CREATE OR REPLACE FUNCTION form_f_no_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Form F % cannot be deleted — the Act requires it be kept for two years.',
      OLD.serial_no USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_form_f_no_delete ON form_f_records;
CREATE TRIGGER trg_form_f_no_delete
  BEFORE DELETE ON form_f_records
  FOR EACH ROW EXECUTE FUNCTION form_f_no_delete();
