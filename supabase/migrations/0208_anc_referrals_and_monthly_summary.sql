-- The referral-out register, and the figures the monthly pack is counted from.
--
-- Note the name. There is already a `referrals` table and it is nothing to do
-- with this one — it tracks business partners who introduced a tenant
-- (partner_id, referred_tenant_id, signup_at). Reusing it would have been a
-- confusion waiting to happen, so the clinical register says what it is.

CREATE TABLE IF NOT EXISTS anc_referrals_out (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE RESTRICT,
  anc_id     uuid REFERENCES anc_records(id) ON DELETE SET NULL,

  -- Snapshotted, as everywhere else in this pack: the return is read long
  -- after the woman's record has moved on.
  patient_name  text,
  relation_name text,
  address_text  text,
  contact_no    text,
  gravida int, para int, living int, abortions int,

  op_no text,
  ip_no text,
  referred_on date NOT NULL,

  -- Where she was sent. The form asks for the doctor AND the institution,
  -- because "referred to a bigger hospital" is not a record of anything.
  referred_to_doctor      text,
  referred_to_institution text,
  referred_to_address     text,
  reason                  text,

  -- And who sent her, with their qualification — the form asks for both.
  referred_by_name          text,
  referred_by_qualification text,

  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS anc_referrals_out_month_idx
  ON anc_referrals_out (tenant_id, referred_on DESC);

ALTER TABLE anc_referrals_out ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anc_referrals_out_tenant_all ON anc_referrals_out;
CREATE POLICY anc_referrals_out_tenant_all ON anc_referrals_out FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

-- ── The counted reports ────────────────────────────────────────────────────
--
-- Reports I and III are the two the authority actually analyses. The others
-- are registers it can audit against; these two are where a pattern shows.
--
-- Report I asks how many scans of each kind were done. Report III asks how
-- many boys and how many girls were born, and — the real question — how many
-- of the women delivering already had daughters.
--
-- Both are computed. Neither is typed in anywhere.

CREATE OR REPLACE FUNCTION get_monthly_return_summary(p_month text, p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := COALESCE(p_tenant_id, current_tenant_id());
  v_start  date := (p_month || '-01')::date;
  v_end    date := ((p_month || '-01')::date + interval '1 month')::date;
  v_out    jsonb;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'get_monthly_return_summary: tenant_id could not be resolved';
  END IF;

  WITH
  -- ── Report I ────────────────────────────────────────────────────────────
  forms AS (
    SELECT * FROM form_f_records
     WHERE tenant_id = v_tenant AND status = 'complete'
       AND procedure_date >= v_start AND procedure_date < v_end
  ),
  -- Every ultrasound, not only the ones with a Form F. The bucket is set once
  -- per catalogue entry because nothing in the data distinguishes a cardiac
  -- scan from an antenatal one.
  scans AS (
    SELECT c.pcpndt_bucket AS bucket, count(*)::int AS n
      FROM radiology_orders o
      JOIN radiology_catalog c ON c.id = o.test_id
     WHERE o.tenant_id = v_tenant
       AND o.ordered_at >= v_start AND o.ordered_at < v_end
       AND o.status <> 'cancelled'
       AND COALESCE(c.pcpndt_bucket, '') <> 'not_ultrasound'
     GROUP BY c.pcpndt_bucket
  ),
  invasive AS (
    SELECT unnest(invasive_procedures) AS code FROM forms WHERE is_invasive
  ),
  extra_tests AS (
    SELECT unnest(additional_tests) AS code FROM forms WHERE is_invasive
  ),
  -- ── Report III ──────────────────────────────────────────────────────────
  births AS (
    SELECT b.sex, b.outcome
      FROM delivery_babies b
      JOIN deliveries d ON d.id = b.delivery_id
     WHERE b.tenant_id = v_tenant
       AND d.delivered_at >= v_start AND d.delivered_at < v_end
  ),
  -- Women who delivered this month, with the daughters they already had.
  -- Counted from patient_children, which records the children a woman had
  -- BEFORE this delivery — that is the comparison the Act is interested in.
  mothers AS (
    SELECT d.patient_id,
           (SELECT count(*) FROM patient_children pc
             WHERE pc.patient_id = d.patient_id AND pc.is_living AND pc.sex = 'female')::int AS daughters,
           (SELECT count(*) FROM patient_children pc
             WHERE pc.patient_id = d.patient_id AND pc.is_living)::int AS living
      FROM deliveries d
     WHERE d.tenant_id = v_tenant
       AND d.delivered_at >= v_start AND d.delivered_at < v_end
  ),
  terminations AS (
    SELECT count(*)::int AS n FROM mtp_records
     WHERE tenant_id = v_tenant AND status = 'complete'
       AND procedure_date >= v_start AND procedure_date < v_end
  )
  SELECT jsonb_build_object(
    'month', p_month,
    'report_i', jsonb_build_object(
      'forms_f_obtained', (SELECT count(*) FROM forms),
      'scans', COALESCE((SELECT jsonb_object_agg(COALESCE(bucket, 'unmapped'), n) FROM scans), '{}'::jsonb),
      'scans_unmapped', COALESCE((SELECT n FROM scans WHERE bucket IS NULL), 0),
      'invasive_procedures', COALESCE((SELECT jsonb_object_agg(code, n) FROM
        (SELECT code, count(*)::int n FROM invasive GROUP BY code) x), '{}'::jsonb),
      'additional_tests', COALESCE((SELECT jsonb_object_agg(code, n) FROM
        (SELECT code, count(*)::int n FROM extra_tests GROUP BY code) y), '{}'::jsonb),
      -- "No. of MTP Advised" counts forms where field 16 records a real
      -- indication. The Act expects NA written where there is none, so the
      -- presence of text is not the test.
      'mtp_advised', (SELECT count(*) FROM forms
         WHERE mtp_indication IS NOT NULL
           AND lower(regexp_replace(mtp_indication, '[.[:space:]/]', '', 'g'))
               NOT IN ('na','nil','no','none','notapplicable','-'))
    ),
    'report_iii', jsonb_build_object(
      'live_male',   (SELECT count(*) FROM births WHERE outcome = 'live_birth' AND sex = 'male'),
      'live_female', (SELECT count(*) FROM births WHERE outcome = 'live_birth' AND sex = 'female'),
      'live_total',  (SELECT count(*) FROM births WHERE outcome = 'live_birth'),
      'intra_uterine_deaths',
        (SELECT count(*) FROM births WHERE outcome IN ('fresh_stillbirth','macerated_stillbirth')),
      'mothers_primi',          (SELECT count(*) FROM mothers WHERE living = 0),
      'mothers_one_daughter',   (SELECT count(*) FROM mothers WHERE daughters = 1),
      'mothers_two_plus_daughters', (SELECT count(*) FROM mothers WHERE daughters >= 2),
      'mothers_other',
        (SELECT count(*) FROM mothers WHERE living > 0 AND daughters = 0),
      'mothers_total',          (SELECT count(*) FROM mothers),
      'abortions_mtp',          (SELECT n FROM terminations)
    ),
    'readiness', jsonb_build_object(
      'form_f_drafts', (SELECT count(*) FROM form_f_records
         WHERE tenant_id = v_tenant AND status = 'draft'
           AND form_date >= v_start AND form_date < v_end),
      'mtp_drafts', (SELECT count(*) FROM mtp_records
         WHERE tenant_id = v_tenant AND status = 'draft'
           AND created_at >= v_start AND created_at < v_end),
      -- A scan nobody has placed in a column is a scan missing from Report I.
      'scans_unmapped_studies', (SELECT count(*) FROM radiology_catalog
         WHERE tenant_id = v_tenant AND is_active AND pcpndt_bucket IS NULL),
      'tracked_drugs', (SELECT count(*) FROM mtp_tracked_drugs
         WHERE tenant_id = v_tenant AND is_active),
      'referrals', (SELECT count(*) FROM anc_referrals_out
         WHERE tenant_id = v_tenant AND referred_on >= v_start AND referred_on < v_end)
    )
  ) INTO v_out;

  RETURN v_out;
END $$;

COMMENT ON FUNCTION get_monthly_return_summary(text, uuid) IS
  'Reports I and III for one month, plus what is not yet fit to file. Computed; nothing here is entered by hand.';
