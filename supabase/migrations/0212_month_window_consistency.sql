-- A form you are told to fix but cannot find.
--
-- The register lists a Form F by its procedure date, falling back to the date
-- it was opened when the scan has not been dated yet. The "not finished" count
-- used the opened date only.
--
-- Those agree almost always, and disagree across a month boundary — a form
-- opened on 31 October for a scan done on 1 November. Proven on a copy:
--
--   October  readiness says 2 unfinished
--   October  register shows 1
--   November readiness says 0, register shows the other one
--
-- So a hospital filing October is told something is unfinished, opens the
-- register, finds nothing wrong, and October never becomes ready to file. The
-- warning is correct and useless at the same time, which is worse than being
-- absent.
--
-- One rule everywhere: the month a record belongs to is the month the
-- procedure happened in, or — while that is still blank — the month the record
-- was opened.

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
  forms AS (
    SELECT * FROM form_f_records
     WHERE tenant_id = v_tenant AND status = 'complete'
       AND procedure_date >= v_start AND procedure_date < v_end
  ),
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
  invasive AS (SELECT unnest(invasive_procedures) AS code FROM forms WHERE is_invasive),
  extra_tests AS (SELECT unnest(additional_tests) AS code FROM forms WHERE is_invasive),
  births AS (
    SELECT b.sex, b.outcome
      FROM delivery_babies b JOIN deliveries d ON d.id = b.delivery_id
     WHERE b.tenant_id = v_tenant
       AND d.delivered_at >= v_start AND d.delivered_at < v_end
  ),
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
      'mothers_other',          (SELECT count(*) FROM mothers WHERE living > 0 AND daughters = 0),
      'mothers_total',          (SELECT count(*) FROM mothers),
      'abortions_mtp',          (SELECT n FROM terminations)
    ),
    'readiness', jsonb_build_object(
      -- Same rule the register lists by, or the hospital is told to fix
      -- something it cannot find.
      'form_f_drafts', (SELECT count(*) FROM form_f_records
         WHERE tenant_id = v_tenant AND status = 'draft'
           AND COALESCE(procedure_date, form_date) >= v_start
           AND COALESCE(procedure_date, form_date) <  v_end),
      'mtp_drafts', (SELECT count(*) FROM mtp_records
         WHERE tenant_id = v_tenant AND status = 'draft'
           AND COALESCE(procedure_date, created_at::date) >= v_start
           AND COALESCE(procedure_date, created_at::date) <  v_end),
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
