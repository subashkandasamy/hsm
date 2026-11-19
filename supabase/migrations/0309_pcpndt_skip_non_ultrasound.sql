-- X-rays are not ultrasound.
--
-- The monthly PC&PNDT scan count (Report I) is built from radiology orders, and
-- each catalogue test has to be placed in one of its columns once
-- (radiology_catalog.pcpndt_bucket). Anything not placed was counted as an
-- "unplaced scan", and the return refused to look ready until every test in
-- the catalogue had a column.
--
-- That included X-rays, CTs and MRIs. Found at KMCH, 19 Nov 2026: 27 X-ray
-- tests nobody had placed, so October showed "31 scans not placed in a column"
-- when the hospital had done no pregnancy ultrasound at all. A hospital that
-- does mostly X-ray would have to mark every X-ray "Not ultrasound" by hand
-- before the warning went away, which nobody should have to be told to do.
--
-- Now a test whose modality is plainly not ultrasound is left out on its own,
-- unless the hospital placed it somewhere itself (that choice always wins).
-- Ultrasound, echo, and anything we cannot recognise still have to be placed:
-- guessing wrong there would change a statutory count.
--
-- Changes no rows. pcpndt_bucket stays NULL; the exclusion is worked out when
-- the return is read, so a hospital can still place any test explicitly.
--
-- The list mirrors canonical() in src/lib/radiology/modality.ts, so the Setup
-- page (which uses that) and this return agree. npm run verify:pcpndt-buckets
-- checks the two give the same answer for every spelling.

CREATE OR REPLACE FUNCTION pcpndt_auto_bucket(p_modality text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN lower(regexp_replace(COALESCE(p_modality, ''), '[^a-zA-Z0-9]', '', 'g')) = ANY (ARRAY[
      -- X-ray
      'xray', 'dx', 'cr', 'radiograph', 'radiography',
      -- CT
      'ct', 'ctscan', 'computedtomography',
      -- MRI
      'mri', 'mr', 'mriscan', 'magneticresonance',
      -- Mammography
      'mammography', 'mammogram', 'mg',
      -- Nuclear medicine and PET
      'nuclear', 'pet', 'petct',
      -- Angiography, interventional, fluoroscopy
      'angiography', 'interventional', 'fluoroscopy',
      -- Dental (OPG)
      'dental', 'opg', 'panoramic',
      -- Bone density
      'dexa', 'dexascan', 'bonedensitometry'
    ])
    THEN 'not_ultrasound'
  END
$$;

COMMENT ON FUNCTION pcpndt_auto_bucket(text) IS
  'not_ultrasound for a catalogue modality that is plainly not ultrasound (X-ray, CT, MRI…), else NULL. Mirrors canonical() in src/lib/radiology/modality.ts.';

-- Not for anonymous callers: a new function is PUBLIC-executable by default
-- and PostgREST publishes it (scripts/verify-rpc-grants.sql).
REVOKE ALL ON FUNCTION public.pcpndt_auto_bucket(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pcpndt_auto_bucket(text) TO authenticated, service_role;

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
    -- A column the hospital chose always wins; an X-ray, CT or MRI nobody
    -- placed is left out on its own (pcpndt_auto_bucket), never "unplaced".
    SELECT COALESCE(c.pcpndt_bucket, pcpndt_auto_bucket(c.modality)) AS bucket, count(*)::int AS n
      FROM radiology_orders o
      JOIN radiology_catalog c ON c.id = o.test_id
     WHERE o.tenant_id = v_tenant
       AND o.ordered_at >= v_start AND o.ordered_at < v_end
       AND o.status <> 'cancelled'
       AND COALESCE(c.pcpndt_bucket, pcpndt_auto_bucket(c.modality), '') <> 'not_ultrasound'
     GROUP BY 1
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
         WHERE tenant_id = v_tenant AND is_active AND pcpndt_bucket IS NULL
           AND pcpndt_auto_bucket(modality) IS NULL),
      'tracked_drugs', (SELECT count(*) FROM mtp_tracked_drugs
         WHERE tenant_id = v_tenant AND is_active),
      'referrals', (SELECT count(*) FROM anc_referrals_out
         WHERE tenant_id = v_tenant AND referred_on >= v_start AND referred_on < v_end)
    )
  ) INTO v_out;

  RETURN v_out;
END $$;

