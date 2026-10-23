-- The referral letter, for any patient leaving to be treated somewhere else.
--
-- The third of the three forms the hospital showed us. Unlike the other two it
-- is not medico-legal at all — it is an ordinary clinical letter, and the only
-- reason it arrived in a medico-legal bundle is that a casualty refers more
-- people than any other department.
--
-- So it is built generally. An outpatient sent to a cardiologist, an inpatient
-- moved to a medical college for a procedure this hospital cannot do, and a
-- casualty case sent on because the CT scanner is down all need the same
-- letter, and all three carry the same consequence: the receiving doctor treats
-- this patient on the strength of what is written here.
--
-- ── Why this is not a gated register ──────────────────────────────────────
--
-- form_f_records and mlc_records are locked once signed, because they are
-- evidence and a divergence between the register and the copy already filed is
-- indistinguishable from concealment.
--
-- This is a letter. It is not filed with anybody, nobody is prosecuted over
-- its contents, and a doctor who wants to add a line before the patient leaves
-- should be able to. Applying the medico-legal machinery here would be cargo
-- cult: the ceremony without the reason for it.
--
-- What it does keep is the snapshot. A letter reprinted next year has to say
-- what was true on the day the patient left, so the patient's details, the
-- admission number and the referring doctor are copied in and never joined
-- live.
--
-- ── Why not anc_referrals_out ─────────────────────────────────────────────
--
-- That table already holds almost exactly these columns, and generalising it
-- was the first instinct. It is left alone deliberately: it feeds
-- get_monthly_return_summary, a statutory PC&PNDT return, where "referrals"
-- means referrals out of antenatal care specifically. Widening it would have
-- quietly started counting every outpatient referral in a government return,
-- and a compliance figure that silently changes meaning is a worse fault than
-- two tables sharing a dozen column names.

CREATE TABLE IF NOT EXISTS referral_seq (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year      int  NOT NULL,
  last_no   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, year)
);

ALTER TABLE referral_seq ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referral_seq_tenant_all ON referral_seq;
CREATE POLICY referral_seq_tenant_all ON referral_seq FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

CREATE OR REPLACE FUNCTION get_next_referral_no(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_fy     int  := fy_start_year();
  v_seq    int;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'get_next_referral_no: tenant_id could not be resolved';
  END IF;
  INSERT INTO referral_seq (tenant_id, year, last_no) VALUES (v_tenant, v_fy, 1)
  ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = referral_seq.last_no + 1
  RETURNING last_no INTO v_seq;
  RETURN 'REF/' || fy_token() || '/' || lpad(v_seq::text, 5, '0');
END $$;

CREATE TABLE IF NOT EXISTS referrals_out (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ref_no    text NOT NULL,

  -- Where the patient was when the decision was taken. All optional, because
  -- a referral can also be written for somebody who simply walked in asking
  -- for one, and exactly one of them is usually set.
  patient_id        uuid REFERENCES patients(id) ON DELETE RESTRICT,
  -- No foreign key: visits is range-partitioned on visit_date, so its primary
  -- key is (id, visit_date) and nothing can reference id alone. Same reason the
  -- lab tables carry bare visit ids.
  visit_id          uuid,
  admission_id      uuid REFERENCES admissions(id) ON DELETE SET NULL,
  emergency_case_id uuid REFERENCES emergency_cases(id) ON DELETE SET NULL,
  source            text NOT NULL,

  -- ── The patient, as at the day they left ────────────────────────────────
  patient_name  text,
  patient_age   int,
  patient_sex   text,
  address_text  text,
  contact_no    text,
  mr_no         text,   -- the UHID; the printed forms call it MR No.
  op_no         text,
  ip_no         text,
  -- Date of admission or of arrival in casualty. The receiving hospital reads
  -- this to know how long the patient has already been treated.
  doa           timestamptz,
  referred_at   timestamptz NOT NULL DEFAULT now(),

  -- ── Why, and in what state ──────────────────────────────────────────────
  diagnosis            text,
  investigations_done  text,
  treatment_given      text,
  condition_at_referral text,
  vitals_text          text,
  reason               text,

  -- ── Where to ────────────────────────────────────────────────────────────
  --
  -- Doctor AND institution, as the form asks, because "referred to a bigger
  -- hospital" is not a record of anything — and because a letter addressed to
  -- nobody tends to be read by nobody.
  to_doctor      text,
  to_institution text,
  to_department  text,
  to_address     text,

  -- ── Getting there ───────────────────────────────────────────────────────
  --
  -- Asked because it is the part that goes wrong. A patient sent by their own
  -- transport who needed an ambulance is the complaint a hospital hears about
  -- afterwards, and this is the only contemporaneous note of what was arranged.
  transport        text,
  accompanied_by   text,
  transport_note   text,

  -- ── Who referred them ───────────────────────────────────────────────────
  referred_by_id            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  referred_by_name          text,
  referred_by_qualification text,
  referred_by_reg_no        text,

  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT referrals_out_ref_no_key UNIQUE (tenant_id, ref_no),
  CONSTRAINT referrals_out_source_check
    CHECK (source = ANY (ARRAY['opd','ipd','emergency','other'])),
  CONSTRAINT referrals_out_sex_check
    CHECK (patient_sex IS NULL OR patient_sex = ANY (ARRAY['male','female','other','unknown'])),
  CONSTRAINT referrals_out_transport_check
    CHECK (transport IS NULL OR transport = ANY (ARRAY['own','hospital_ambulance','other_ambulance','other'])),
  -- The one thing a referral letter cannot be without. Everything else can be
  -- added in handwriting on the way out; a letter with no destination and no
  -- reason is a blank sheet with a letterhead.
  CONSTRAINT referrals_out_destination_check
    CHECK (COALESCE(NULLIF(trim(to_institution), ''), NULLIF(trim(to_doctor), '')) IS NOT NULL),
  CONSTRAINT referrals_out_reason_check
    CHECK (reason IS NOT NULL AND length(trim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS referrals_out_tenant_date_idx
  ON referrals_out (tenant_id, referred_at DESC);
CREATE INDEX IF NOT EXISTS referrals_out_patient_idx
  ON referrals_out (tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS referrals_out_admission_idx
  ON referrals_out (admission_id) WHERE admission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS referrals_out_visit_idx
  ON referrals_out (visit_id) WHERE visit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS referrals_out_case_idx
  ON referrals_out (emergency_case_id) WHERE emergency_case_id IS NOT NULL;

ALTER TABLE referrals_out ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referrals_out_tenant_all ON referrals_out;
CREATE POLICY referrals_out_tenant_all ON referrals_out FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

COMMENT ON TABLE referrals_out IS
  'Referral letters issued to patients leaving for treatment elsewhere — OPD, IPD or casualty. A clinical letter, not a statutory register; anc_referrals_out remains separate because it feeds a PC&PNDT return.';
