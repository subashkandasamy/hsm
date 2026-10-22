-- The MTP register, and the drug ledger that has to agree with it.
--
-- Under the Medical Termination of Pregnancy Act every approved place sends
-- the district Chief Medical Officer a monthly statement of terminations. The
-- Tamil Nadu pack asks for it as Report IV, alongside Report V — a stock
-- account of the abortion drugs.
--
-- Those two reports are read together, and that is the point of them. A
-- hospital that reports four terminations but has used thirty combipacks has
-- told the authority something, whether it meant to or not. Building them off
-- the same data is what keeps the hospital honest by default rather than by
-- effort.

-- ── Why a termination was lawful ───────────────────────────────────────────
--
-- Section 3(2) permits termination on stated grounds only, and the form asks
-- for the reason. Seeded alongside the PC&PNDT lists for the same reason: the
-- wording is the law's, not ours.

INSERT INTO pcpndt_options (kind, code, ordinal, label) VALUES
  ('mtp_ground','life',1,'Risk to the life of the pregnant woman'),
  ('mtp_ground','physical',2,'Grave injury to her physical health'),
  ('mtp_ground','mental',3,'Grave injury to her mental health'),
  ('mtp_ground','abnormality',4,'Substantial risk of serious physical or mental abnormality in the child'),
  ('mtp_ground','contraceptive',5,'Failure of contraceptive used by the woman or her partner'),
  ('mtp_ground','rape',6,'Pregnancy alleged to have been caused by rape')
ON CONFLICT (kind, code) DO UPDATE SET label = EXCLUDED.label, ordinal = EXCLUDED.ordinal;

-- ── The case register ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mtp_records (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  serial_no  text NOT NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'draft',

  -- Snapshotted for the same reason Form F is: this is what was true on the
  -- day, and it has to stay readable years later.
  patient_name  text,
  patient_age_years int,
  relation_type text,
  relation_name text,   -- "husband's name" on Report IV
  address_text  text,
  district      text,
  state         text,
  pincode       text,
  contact_no    text,

  -- Obstetric history, as the form writes it: G, P, L, A.
  gravida   int,
  para      int,
  living    int,
  abortions int,
  -- Living children by sex — Report IV asks for MC, FC and total separately,
  -- because that is the number the whole Act is watching.
  living_male   int,
  living_female int,

  lmp              date,
  -- "No. of weeks of pregnancy (GA as per USG report)" — the form is explicit
  -- that this comes off the scan, not off the dates.
  gestation_weeks  int,
  ga_source        text,

  admission_id  uuid REFERENCES admissions(id) ON DELETE SET NULL,
  ip_no         text,
  admitted_on   date,
  discharged_on date,

  -- Who actually performed it. Not the admitting doctor, not whoever signed
  -- the discharge — the form asks for the person who did the procedure.
  performed_by_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  performed_by_name text,
  performed_by_reg_no text,

  grounds       text[],   -- Section 3(2), from pcpndt_options
  reason_text   text,     -- "Reason for MTP / Abortion" in the hospital's words
  method        text,     -- medical | surgical
  drug_id       uuid REFERENCES drugs(id) ON DELETE SET NULL,
  drug_name     text,

  -- Beyond twenty weeks the Act needs the opinion of two registered medical
  -- practitioners, not one. Recording both is how a hospital shows it.
  second_opinion_by_name   text,
  second_opinion_by_reg_no text,
  consent_obtained_on      date,   -- Form C

  procedure_date date,
  outcome        text,
  complications  text,

  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,

  CONSTRAINT mtp_status_check CHECK (status = ANY (ARRAY['draft','complete'])),
  CONSTRAINT mtp_serial_key UNIQUE (tenant_id, serial_no),
  CONSTRAINT mtp_method_check CHECK (method IS NULL OR method = ANY (ARRAY['medical','surgical'])),
  CONSTRAINT mtp_relation_check
    CHECK (relation_type IS NULL OR relation_type = ANY (ARRAY['husband','wife','father','mother'])),
  -- Discharge cannot precede admission, and a procedure cannot precede
  -- consent. Both are the sort of thing that only shows up at an inspection.
  CONSTRAINT mtp_discharge_after_admit
    CHECK (admitted_on IS NULL OR discharged_on IS NULL OR discharged_on >= admitted_on),
  CONSTRAINT mtp_consent_before_procedure
    CHECK (consent_obtained_on IS NULL OR procedure_date IS NULL
           OR consent_obtained_on <= procedure_date)
);

CREATE INDEX IF NOT EXISTS mtp_tenant_month_idx
  ON mtp_records (tenant_id, procedure_date DESC);
CREATE INDEX IF NOT EXISTS mtp_tenant_status_idx
  ON mtp_records (tenant_id, status);

ALTER TABLE mtp_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mtp_records_tenant_all ON mtp_records;
CREATE POLICY mtp_records_tenant_all ON mtp_records FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

CREATE TABLE IF NOT EXISTS mtp_seq (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year      int  NOT NULL,
  last_no   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, year)
);
ALTER TABLE mtp_seq ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mtp_seq_tenant_all ON mtp_seq;
CREATE POLICY mtp_seq_tenant_all ON mtp_seq FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

CREATE OR REPLACE FUNCTION get_next_mtp_no(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_fy int := fy_start_year();
  v_seq int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'get_next_mtp_no: tenant_id could not be resolved'; END IF;
  INSERT INTO mtp_seq (tenant_id, year, last_no) VALUES (v_tenant, v_fy, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = mtp_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  RETURN 'MTP/' || fy_token() || '/' || lpad(v_seq::text, 5, '0');
END $$;

-- Same gate as Form F, for the same reason. A monthly statement assembled
-- from half-filled rows is a statement that is wrong.
CREATE OR REPLACE FUNCTION mtp_completeness_gate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE missing text[] := '{}';
BEGIN
  IF NEW.status <> 'complete' THEN RETURN NEW; END IF;

  IF NEW.patient_name IS NULL OR trim(NEW.patient_name) = '' THEN missing := array_append(missing, 'patient name'); END IF;
  IF NEW.relation_name IS NULL OR trim(NEW.relation_name) = '' THEN missing := array_append(missing, 'husband''s name'); END IF;
  IF NEW.address_text IS NULL OR trim(NEW.address_text) = '' THEN missing := array_append(missing, 'address'); END IF;
  IF NEW.gravida IS NULL THEN missing := array_append(missing, 'gravida (G)'); END IF;
  IF NEW.para    IS NULL THEN missing := array_append(missing, 'para (P)'); END IF;
  IF NEW.living  IS NULL THEN missing := array_append(missing, 'living children (L)'); END IF;
  IF NEW.abortions IS NULL THEN missing := array_append(missing, 'abortions (A)'); END IF;
  IF NEW.gestation_weeks IS NULL THEN missing := array_append(missing, 'weeks of pregnancy from the scan'); END IF;
  IF NEW.performed_by_name IS NULL OR trim(NEW.performed_by_name) = '' THEN
    missing := array_append(missing, 'the doctor who performed the procedure'); END IF;
  IF NEW.grounds IS NULL OR array_length(NEW.grounds, 1) IS NULL THEN
    missing := array_append(missing, 'the ground under Section 3(2)'); END IF;
  IF NEW.procedure_date IS NULL THEN missing := array_append(missing, 'date of the procedure'); END IF;
  IF NEW.consent_obtained_on IS NULL THEN missing := array_append(missing, 'date consent was taken (Form C)'); END IF;

  -- Beyond twenty weeks one doctor's opinion is not enough in law.
  IF NEW.gestation_weeks IS NOT NULL AND NEW.gestation_weeks > 20
     AND (NEW.second_opinion_by_name IS NULL OR trim(NEW.second_opinion_by_name) = '') THEN
    missing := array_append(missing,
      'a second registered medical practitioner''s opinion — the Act requires two beyond twenty weeks');
  END IF;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION '%', 'This MTP record cannot be completed — ' || array_to_string(missing, '; ')
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
    NEW.completed_by := COALESCE(NEW.completed_by, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mtp_completeness ON mtp_records;
CREATE TRIGGER trg_mtp_completeness
  BEFORE INSERT OR UPDATE ON mtp_records
  FOR EACH ROW EXECUTE FUNCTION mtp_completeness_gate();
