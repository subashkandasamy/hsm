-- The Accident Register — the medico-legal case record.
--
-- A hospital that treats an injured person has duties that have nothing to do
-- with treating them. Under BNSS 2023 section 397 every hospital, government
-- or private, must give first aid free of charge AND inform the police
-- immediately; BNS section 200 makes not treating the patient an offence in
-- itself. Neither duty is waivable by the patient: consent is not required to
-- register a medico-legal case, and the obligation rests on the treating
-- doctor personally rather than on the institution.
--
-- The hospital's own record of having done this is the Accident Register. It
-- is written in triplicate — one copy to the police, one to the injured person
-- or their nominee, one kept — and it is the document that is produced in
-- court, sometimes years later, usually by a doctor who has long since
-- forgotten the patient.
--
-- ── Why this is a separate table and not columns on emergency_cases ────────
--
-- emergency_cases has ten columns and describes a queue: who arrived, how
-- urgent, who is seeing them, what happened to them. It is edited freely all
-- shift, as it should be.
--
-- An AR entry is the opposite kind of object. It is snapshotted, serialised,
-- gated for completeness, locked once signed and never deleted — the same
-- shape as form_f_records, and for the same reason: it is evidence. Mixing the
-- two would mean either a queue nobody can correct or a legal record anybody
-- can.
--
-- ── What is national and what is local ────────────────────────────────────
--
-- The duties and the fields are national. The sheet is not: hospitals print
-- these on their own letterhead and the layout varies between them, though
-- the content largely agrees. So the columns here are the union of what the
-- formats ask for, and all layout lives in one renderer.
--
-- Tamil Nadu's digital route (MedLEaPR, via CCTNS 2.0) covers government
-- hospitals only. Private hospitals still file on paper, so nothing here
-- transmits anything anywhere — the register records that a printed copy was
-- handed over, to whom, and when.

-- ── The categories that make a case medico-legal ───────────────────────────
--
-- A reference table rather than strings in code, because the common failure
-- in a casualty is not filling the form badly — it is nobody realising the
-- case was medico-legal at all. The list is the prompt.

CREATE TABLE IF NOT EXISTS mlc_options (
  -- 'mlc_type'     why this case is medico-legal
  -- 'injury_nature' the wound described in the register's own vocabulary
  kind    text NOT NULL,
  code    text NOT NULL,
  ordinal int  NOT NULL,
  label   text NOT NULL,
  -- Grouped in the UI so a casualty nurse scans a short list, not forty rows.
  group_label text,
  PRIMARY KEY (kind, code)
);

COMMENT ON TABLE mlc_options IS
  'The categories that oblige a hospital to register a medico-legal case. Shared by every tenant, never edited by a hospital.';

INSERT INTO mlc_options (kind, code, ordinal, label, group_label) VALUES
  ('mlc_type','rta',              1,'Road traffic accident',                        'Accident'),
  ('mlc_type','fall',             2,'Fall from height',                             'Accident'),
  ('mlc_type','industrial',       3,'Industrial or machinery injury',               'Accident'),
  ('mlc_type','electrical',       4,'Electrical injury',                            'Accident'),
  ('mlc_type','burns',            5,'Burns — flame, scald, chemical or electrical',  'Accident'),
  ('mlc_type','drowning',         6,'Drowning or near-drowning',                    'Accident'),

  ('mlc_type','assault_blunt',    7,'Assault — blunt weapon',                       'Assault'),
  ('mlc_type','assault_sharp',    8,'Assault — sharp weapon',                       'Assault'),
  ('mlc_type','firearm',          9,'Firearm injury',                               'Assault'),
  ('mlc_type','sexual_assault',  10,'Alleged sexual assault',                       'Assault'),
  -- Section 498A territory. The hospital's note may be the only contemporaneous
  -- record, so the register asks the question explicitly.
  ('mlc_type','dowry_injury',    11,'Injury or burns to a woman within seven years of marriage','Assault'),
  ('mlc_type','child_abuse',     12,'Suspected child abuse or neglect',             'Assault'),
  ('mlc_type','custodial',       13,'Injury in police or judicial custody',         'Assault'),

  ('mlc_type','poisoning',       14,'Poisoning — accidental or alleged',             'Poisoning & intoxication'),
  ('mlc_type','overdose',        15,'Drug overdose',                                'Poisoning & intoxication'),
  ('mlc_type','alcohol',         16,'Alcohol intoxication',                         'Poisoning & intoxication'),
  ('mlc_type','bite',            17,'Snake, animal, insect or human bite',           'Poisoning & intoxication'),

  ('mlc_type','attempted_suicide',18,'Attempted suicide',                           'Self-harm'),
  ('mlc_type','hanging',         19,'Hanging or strangulation',                      'Self-harm'),

  ('mlc_type','brought_dead',    20,'Brought dead',                                 'Other'),
  ('mlc_type','unconscious',     21,'Brought unconscious or comatose, cause unknown','Other'),
  ('mlc_type','criminal_abortion',22,'Suspected criminal abortion',                 'Other'),
  ('mlc_type','mass_casualty',   23,'Mass casualty or disaster',                    'Other'),
  -- The catch-all that matters most in practice: a clinician who does not
  -- believe the history they have been given is obliged to register the case.
  ('mlc_type','history_mismatch',24,'Injuries not consistent with the history given','Other'),
  ('mlc_type','other',           25,'Any other medico-legal case (specify)',        'Other')
ON CONFLICT (kind, code) DO UPDATE
  SET label = EXCLUDED.label, ordinal = EXCLUDED.ordinal, group_label = EXCLUDED.group_label;

INSERT INTO mlc_options (kind, code, ordinal, label) VALUES
  ('injury_nature','abrasion',    1,'Abrasion'),
  ('injury_nature','contusion',   2,'Contusion / bruise'),
  ('injury_nature','laceration',  3,'Laceration'),
  ('injury_nature','incised',     4,'Incised wound'),
  ('injury_nature','stab',        5,'Stab / punctured wound'),
  ('injury_nature','firearm',     6,'Firearm wound'),
  ('injury_nature','fracture',    7,'Fracture'),
  ('injury_nature','dislocation', 8,'Dislocation'),
  ('injury_nature','burn',        9,'Burn'),
  ('injury_nature','head_injury',10,'Head injury'),
  ('injury_nature','internal',   11,'Suspected internal injury'),
  ('injury_nature','no_external',12,'No external injury seen'),
  ('injury_nature','other',      13,'Other (describe)')
ON CONFLICT (kind, code) DO UPDATE SET label = EXCLUDED.label, ordinal = EXCLUDED.ordinal;

ALTER TABLE mlc_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mlc_options_read ON mlc_options;
CREATE POLICY mlc_options_read ON mlc_options FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

-- ── The AR serial ──────────────────────────────────────────────────────────
--
-- The register is referred to by its serial — "AR No. 142/2026" is how a
-- police requisition or a summons names the case — so a gap in the sequence is
-- a question the hospital has to answer in court. Same atomic counter as the
-- bill and Form F series, keyed by financial year.

CREATE TABLE IF NOT EXISTS mlc_seq (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year      int  NOT NULL,
  last_no   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, year)
);

ALTER TABLE mlc_seq ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mlc_seq_tenant_all ON mlc_seq;
CREATE POLICY mlc_seq_tenant_all ON mlc_seq FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

CREATE OR REPLACE FUNCTION get_next_mlc_no(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_fy     int  := fy_start_year();
  v_seq    int;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'get_next_mlc_no: tenant_id could not be resolved';
  END IF;
  INSERT INTO mlc_seq (tenant_id, year, last_no) VALUES (v_tenant, v_fy, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = mlc_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  -- "AR/2627/00142" — the financial year, matching every other series in the
  -- product, so a year's records sit together under inspection.
  RETURN 'AR/' || fy_token() || '/' || lpad(v_seq::text, 5, '0');
END $$;

-- ── The record ─────────────────────────────────────────────────────────────
--
-- Snapshotted like Form F, and for the identical reason: this is a legal
-- document, not a view of current data. If the patient's address changes next
-- year, the AR entry must still say where they lived on the night they were
-- brought in. So name, age, sex, address and MR number are copied at creation
-- and never joined live.

CREATE TABLE IF NOT EXISTS mlc_records (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ar_no     text NOT NULL,

  -- draft    → being filled, incomplete allowed
  -- complete → signed and locked; corrections become an amendment
  -- amended  → superseded by the row that points at it
  status       text NOT NULL DEFAULT 'draft',
  amends_id    uuid REFERENCES mlc_records(id) ON DELETE RESTRICT,
  amend_reason text,

  -- The casualty case this arose from. Optional, because a medico-legal case
  -- can walk into OPD or be found on the ward — an assault discovered during
  -- an admission is still an AR entry.
  emergency_case_id uuid REFERENCES emergency_cases(id) ON DELETE SET NULL,
  patient_id        uuid REFERENCES patients(id) ON DELETE RESTRICT,

  -- ── The patient, as at the time of the entry ────────────────────────────
  patient_name   text,
  patient_age    int,
  patient_sex    text,
  patient_address text,
  mr_no          text,   -- the UHID, which the forms call MR No.
  -- Two marks, because that is what the register asks for and what makes an
  -- unidentified body identifiable later.
  identification_mark_1 text,
  identification_mark_2 text,

  -- ── Who brought them ────────────────────────────────────────────────────
  --
  -- The Madras High Court held in Ramasubramanian v. State of Tamil Nadu that
  -- a hospital must record the name and particulars of the person who brought
  -- the victim. "108" is an ambulance, not a person; writing it alone is the
  -- very omission the court was addressing, and the gate in the next migration
  -- rejects it.
  brought_by_name     text,
  brought_by_relation text,
  brought_by_address  text,
  brought_by_phone    text,

  -- ── The incident ────────────────────────────────────────────────────────
  mlc_types       text[],  -- codes from mlc_options; a case can be more than one
  mlc_type_other  text,
  alleged_cause   text,    -- in the informant's words, recorded as alleged
  place_of_occurrence text,
  occurred_at     timestamptz,
  arrived_at      timestamptz,  -- D.O.A. on the printed sheet
  -- Specific to this case rather than generic: a court asks for the number.
  vehicle_numbers text,

  -- ── The examination ─────────────────────────────────────────────────────
  injury_natures   text[],  -- codes from mlc_options
  injury_details   text,    -- site, size, shape, age of each wound
  -- The classification the whole prosecution turns on, under BNS sections 115
  -- and 117. Deliberately allows 'deferred' — a doctor who cannot yet say
  -- should not be forced to guess, but must say that they cannot.
  injury_grade     text,
  injury_grade_note text,
  -- Recorded because intoxication changes both the clinical and the legal
  -- picture, and because the register asks.
  smell_of_alcohol boolean,
  conscious_state  text,
  first_aid_given  text,

  -- A patient who may not survive to testify can give a dying declaration,
  -- which only a magistrate or, in their absence, the doctor may record. The
  -- flag exists so that the decision is made rather than overlooked.
  dying_declaration_needed boolean NOT NULL DEFAULT false,
  dying_declaration_note   text,

  -- ── Disposal ────────────────────────────────────────────────────────────
  examined_by_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  examined_by_name   text,
  examined_by_reg_no text,
  disposal           text,   -- treated and discharged, admitted, referred, died, brought dead
  disposal_note      text,
  admission_id       uuid REFERENCES admissions(id) ON DELETE SET NULL,

  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,

  CONSTRAINT mlc_status_check
    CHECK (status = ANY (ARRAY['draft','complete','amended'])),
  CONSTRAINT mlc_ar_no_key UNIQUE (tenant_id, ar_no),
  CONSTRAINT mlc_sex_check
    CHECK (patient_sex IS NULL OR patient_sex = ANY (ARRAY['male','female','other','unknown'])),
  CONSTRAINT mlc_injury_grade_check
    CHECK (injury_grade IS NULL OR injury_grade = ANY (ARRAY['simple','grievous','dangerous','deferred','none'])),
  CONSTRAINT mlc_disposal_check
    CHECK (disposal IS NULL OR disposal = ANY (ARRAY[
      'treated_discharged','admitted','referred','absconded','died','brought_dead'])),
  -- An amendment must say why. A correction without a reason is
  -- indistinguishable from tampering, and this record is evidence.
  CONSTRAINT mlc_amend_reason_check
    CHECK (amends_id IS NULL OR (amend_reason IS NOT NULL AND length(trim(amend_reason)) > 0))
);

CREATE INDEX IF NOT EXISTS mlc_tenant_arrived_idx
  ON mlc_records (tenant_id, arrived_at DESC);
CREATE INDEX IF NOT EXISTS mlc_tenant_status_idx
  ON mlc_records (tenant_id, status);
CREATE INDEX IF NOT EXISTS mlc_patient_idx
  ON mlc_records (tenant_id, patient_id);
-- One AR entry per casualty case, so the board can show its state without a
-- second query and a double-click cannot create two.
CREATE UNIQUE INDEX IF NOT EXISTS mlc_case_uniq
  ON mlc_records (emergency_case_id)
  WHERE emergency_case_id IS NOT NULL AND status <> 'amended';

ALTER TABLE mlc_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mlc_records_tenant_all ON mlc_records;
CREATE POLICY mlc_records_tenant_all ON mlc_records FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

-- ── Informing the police ───────────────────────────────────────────────────
--
-- A child table, not a pair of columns, because this is an event and often
-- happens more than once: the first intimation on arrival, a second when the
-- patient dies, a third to a different station once jurisdiction is settled.
-- Each is a separate discharge of the duty and each needs its own timestamp.
--
-- Nothing is transmitted. A row here means a printed intimation was handed
-- over or telephoned through, and records who did it and when — which is what
-- the hospital has to prove.

CREATE TABLE IF NOT EXISTS mlc_police_intimations (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mlc_id    uuid NOT NULL REFERENCES mlc_records(id) ON DELETE CASCADE,

  station_name   text NOT NULL,
  officer_name   text,
  officer_rank   text,
  officer_phone  text,
  -- 'in_person' | 'telephone' | 'written' | 'other' — how it was actually done,
  -- because a telephone call at 2am followed by paper in the morning is the
  -- normal pattern and both halves matter.
  method         text NOT NULL,
  intimated_at   timestamptz NOT NULL DEFAULT now(),
  -- Who in the hospital did it. The duty is personal to the doctor, so the
  -- record names a person and not just the institution.
  intimated_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  intimated_by_name text,
  -- Their acknowledgement, when one was given — a receipt number, a GD entry,
  -- an FIR number once registered.
  acknowledgement_ref text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mlc_intimation_method_check
    CHECK (method = ANY (ARRAY['in_person','telephone','written','other'])),
  CONSTRAINT mlc_intimation_station_check
    CHECK (length(trim(station_name)) > 0)
);

CREATE INDEX IF NOT EXISTS mlc_intimation_mlc_idx
  ON mlc_police_intimations (mlc_id, intimated_at);

ALTER TABLE mlc_police_intimations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mlc_intimations_tenant_all ON mlc_police_intimations;
CREATE POLICY mlc_intimations_tenant_all ON mlc_police_intimations FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

-- ── Flagging the casualty case ─────────────────────────────────────────────
--
-- One column on emergency_cases, so the board can show which cases are
-- medico-legal without joining, and — more importantly — so that a case can be
-- marked medico-legal at the moment of registration, before anyone has time to
-- fill a register entry. The decision and the paperwork are separate acts.

ALTER TABLE emergency_cases
  ADD COLUMN IF NOT EXISTS is_mlc boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN emergency_cases.is_mlc IS
  'Marked medico-legal at registration. The AR entry in mlc_records follows; this flag is what makes its absence visible.';

CREATE INDEX IF NOT EXISTS emergency_mlc_idx
  ON emergency_cases (tenant_id, arrived_at DESC) WHERE is_mlc;
