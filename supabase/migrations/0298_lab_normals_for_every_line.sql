-- Every line of a lab report gets its normal, and every result keeps the
-- normal it was judged by.
--
-- Found reading the lab end to end (13 Nov 2026), on Urine Routine — one test,
-- eighteen lines:
--   * numbers (pH, specific gravity) had a range, and a too-narrow one:
--     pH 4.8–7.4 and SG 1.016–1.022 flag healthy urine;
--   * grades (protein, glucose … "Negative") had their normal word on the
--     measurement, but the report never printed it;
--   * written lines (colour, pus cells …) had nowhere to keep a normal at all,
--     so the entry screen said "not set" and the report printed nothing;
--   * a one-box test's result did not keep the range it was judged by, so
--     editing that range later rewrote old reports. Panel lines always did.
-- Also: a panel line cleared on the entry screen (a value typed on the wrong
-- line) now removes that result — the screen used to drop blanks, so it could
-- never be taken off. And an analyzer nobody had set live — or one a hospital
-- had paused — still wrote its results onto patients; such results are now
-- held until it is live (status 'held').
--
-- Code that writes the new columns (lab.ts enterResults) must not go out
-- before this is applied.

BEGIN;

-- ── 1. Somewhere to keep a written normal ───────────────────────────────────
-- On the ranges table, so a written normal works exactly like a number range:
-- Uyirly's standard row, and a hospital's own row that wins over it.
ALTER TABLE lab_reference_ranges ADD COLUMN IF NOT EXISTS normal_text text;
COMMENT ON COLUMN lab_reference_ranges.normal_text IS
  'The normal for a written result (e.g. "0–5" pus cells per HPF, "Pale yellow"). Printed beside the result; written results are not flagged automatically.';

-- Each stored result keeps the normal it was judged by, like ref_low/ref_high,
-- so a report printed next year reads as it did on the day.
ALTER TABLE lab_result_analytes ADD COLUMN IF NOT EXISTS normal_text text;

-- One-box tests keep theirs too.
ALTER TABLE lab_order_items
  ADD COLUMN IF NOT EXISTS ref_low  numeric,
  ADD COLUMN IF NOT EXISTS ref_high numeric,
  ADD COLUMN IF NOT EXISTS ref_text text;
COMMENT ON COLUMN lab_order_items.ref_text IS
  'The reference range text a one-box result was reported against, kept with the result (lab_result_analytes does the same for panel lines).';

-- ── 2. Uyirly's normals for the written urine lines ─────────────────────────
-- Source: Strasinger & Di Lorenzo, Urinalysis and Body Fluids, 7th ed.
-- (F.A. Davis, 2021) — the normal urinalysis. Pus cells and RBCs are per
-- high-power field; the unit prints in its own column.
--
-- One standard row per measurement, sex and age band (0182's unique index),
-- so an existing empty placeholder in that band is filled rather than
-- duplicated, and a new row is added only where the band has none.
UPDATE lab_reference_ranges r
   SET normal_text = v.txt,
       source_note = 'Strasinger & Di Lorenzo, Urinalysis and Body Fluids, 7th ed. (F.A. Davis 2021) — normal urinalysis'
  FROM (VALUES
    ('UR_COLOUR', 'Pale yellow'),
    ('UR_APPEAR', 'Clear'),
    ('UR_PUS',    '0–5'),
    ('UR_RBC',    '0–2'),
    ('UR_EPI',    'Few'),
    ('UR_CAST',   'Nil'),
    ('UR_CRYST',  'Nil')
  ) AS v(code, txt)
  JOIN lab_analytes a ON a.code = v.code
 WHERE r.analyte_id = a.id AND r.tenant_id IS NULL
   AND r.sex = 'any' AND r.age_min_days = 0 AND r.age_max_days = 54750
   AND r.ref_low IS NULL AND r.ref_high IS NULL AND r.normal_text IS NULL;

INSERT INTO lab_reference_ranges
  (id, tenant_id, analyte_id, sex, age_min_days, age_max_days, ref_low, ref_high, source, source_note, normal_text)
SELECT gen_random_uuid(), NULL, a.id, 'any', 0, 54750, NULL, NULL, 'uyirly_standard',
       'Strasinger & Di Lorenzo, Urinalysis and Body Fluids, 7th ed. (F.A. Davis 2021) — normal urinalysis', v.txt
  FROM (VALUES
    ('UR_COLOUR', 'Pale yellow'),
    ('UR_APPEAR', 'Clear'),
    ('UR_PUS',    '0–5'),
    ('UR_RBC',    '0–2'),
    ('UR_EPI',    'Few'),
    ('UR_CAST',   'Nil'),
    ('UR_CRYST',  'Nil')
  ) AS v(code, txt)
  JOIN lab_analytes a ON a.code = v.code
 WHERE NOT EXISTS (
   SELECT 1 FROM lab_reference_ranges r
    WHERE r.analyte_id = a.id AND r.tenant_id IS NULL
      AND r.sex = 'any' AND r.age_min_days = 0 AND r.age_max_days = 54750
 );

-- ── 3. Urine pH and specific gravity: the normal urine ranges ───────────────
-- Only where the old narrow values are still in place.
UPDATE lab_reference_ranges r
   SET ref_low = 4.5, ref_high = 8.0,
       source_note = 'Strasinger & Di Lorenzo, Urinalysis and Body Fluids, 7th ed. (F.A. Davis 2021) — random urine pH 4.5–8.0'
  FROM lab_analytes a
 WHERE a.id = r.analyte_id AND a.code = 'UR_PH' AND r.tenant_id IS NULL
   AND r.ref_low = 4.8 AND r.ref_high = 7.4;

UPDATE lab_reference_ranges r
   SET ref_low = 1.005, ref_high = 1.030,
       source_note = 'Strasinger & Di Lorenzo, Urinalysis and Body Fluids, 7th ed. (F.A. Davis 2021) — random urine specific gravity 1.005–1.030'
  FROM lab_analytes a
 WHERE a.id = r.analyte_id AND a.code = 'UR_SG' AND r.tenant_id IS NULL
   AND r.ref_low = 1.016 AND r.ref_high = 1.022;

-- ── 4. A row that says something beats an empty placeholder ─────────────────
-- As 0252, with normal_text counted as saying something.
CREATE OR REPLACE FUNCTION public.resolve_reference_range(
  p_analyte  uuid,
  p_tenant   uuid,
  p_sex      text,
  p_age_days integer
)
RETURNS lab_reference_ranges
LANGUAGE sql
STABLE
AS $function$
  SELECT r.*
    FROM public.lab_reference_ranges r
   WHERE r.analyte_id = p_analyte
     AND (r.tenant_id IS NULL OR r.tenant_id = p_tenant)
     AND (r.sex = 'any' OR r.sex = COALESCE(p_sex, 'any'))
     AND CASE
           WHEN p_age_days IS NULL
             THEN r.age_min_days = 0
             ELSE p_age_days BETWEEN r.age_min_days AND r.age_max_days
         END
   ORDER BY (r.tenant_id IS NOT NULL) DESC,
            (r.sex <> 'any') DESC,
            CASE
              WHEN p_age_days IS NULL THEN -(r.age_max_days - r.age_min_days)
              ELSE                          (r.age_max_days - r.age_min_days)
            END ASC,
            (r.ref_low IS NOT NULL OR r.ref_high IS NOT NULL OR r.normal_text IS NOT NULL) DESC,
            r.created_at DESC
   LIMIT 1
$function$;

-- ── 5. Saving a result keeps its normal ─────────────────────────────────────
-- As 0197, with two changes: normal_text on the stored row (the written
-- normal for a written line, the normal word(s) for a graded one), and a line
-- sent back empty removes the result instead of storing an empty row.
CREATE OR REPLACE FUNCTION save_lab_analyte_results(
  p_order_id uuid,
  p_items    jsonb,
  p_source   text DEFAULT 'manual',
  p_analyzer uuid DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
) RETURNS TABLE (written int, critical int)
LANGUAGE plpgsql AS $$
DECLARE
  v_tenant   uuid;
  v_patient  uuid;
  v_status   text;
  v_sex      text;
  v_age_days int;
  v_taken    timestamptz;
  v_actor    uuid := auth.uid();
  it         jsonb;
  an         lab_analytes;
  rng        lab_reference_ranges;
  v_flag     text;
  v_num      numeric;
  v_txt      text;
  v_test     uuid;
  n_written  int := 0;
  n_crit     int := 0;
BEGIN
  SELECT o.tenant_id, o.patient_id, o.status, COALESCE(o.ordered_at, now())
    INTO v_tenant, v_patient, v_status, v_taken
    FROM lab_orders o WHERE o.id = p_order_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Lab order % not found', p_order_id USING ERRCODE = 'no_data_found';
  END IF;

  IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'Lab order % belongs to another hospital', p_order_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_source = 'manual' AND v_status = 'ordered' THEN
    RAISE EXCEPTION 'Collect the sample before entering results' USING ERRCODE = 'check_violation';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'This order was cancelled' USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.gender, GREATEST(0, (v_taken::date - p.dob))::int
    INTO v_sex, v_age_days
    FROM patients p WHERE p.id = v_patient;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO an FROM lab_analytes WHERE id = (it->>'analyte_id')::uuid;
    CONTINUE WHEN an.id IS NULL;

    v_test := (it->>'test_id')::uuid;
    v_num := NULLIF(it->>'value_num', '')::numeric;
    v_txt := NULLIF(it->>'value_text', '');

    SELECT * INTO rng FROM resolve_reference_range(an.id, v_tenant, v_sex, v_age_days);

    v_flag := CASE
      WHEN v_num IS NULL AND v_txt IS NULL THEN 'pending'
      WHEN an.value_type = 'ordinal' THEN
        CASE WHEN an.normal_values IS NULL THEN 'unranged'
             WHEN v_txt = ANY (an.normal_values) THEN 'normal'
             ELSE 'abnormal' END
      WHEN an.value_type = 'text' THEN 'unranged'
      WHEN v_num IS NULL THEN 'abnormal'
      WHEN rng.crit_high IS NOT NULL AND v_num >= rng.crit_high THEN 'critical_high'
      WHEN rng.crit_low  IS NOT NULL AND v_num <= rng.crit_low  THEN 'critical_low'
      WHEN rng.ref_high  IS NOT NULL AND v_num >  rng.ref_high  THEN 'high'
      WHEN rng.ref_low   IS NOT NULL AND v_num <  rng.ref_low   THEN 'low'
      WHEN rng.ref_low IS NOT NULL OR rng.ref_high IS NOT NULL   THEN 'normal'
      ELSE 'unranged'
    END;

    DELETE FROM lab_result_analytes
     WHERE lab_order_id = p_order_id AND test_id = v_test AND analyte_id = an.id;

    -- A line sent back empty was cleared on purpose — a value typed on the
    -- wrong line. It is now no result at all, not an empty row: the screen
    -- used to drop blanks, so a wrong value could never be taken off.
    IF v_num IS NULL AND v_txt IS NULL THEN
      PERFORM withdraw_stale_critical(p_order_id, an.id, NULL);
      n_written := n_written + 1;
      CONTINUE;
    END IF;

    INSERT INTO lab_result_analytes (
      tenant_id, lab_order_id, test_id, analyte_id,
      value_num, value_text, unit_ucum,
      ref_low, ref_high, crit_low, crit_high, normal_text,
      flag, source, analyzer_id, entered_by
    ) VALUES (
      v_tenant, p_order_id, v_test, an.id,
      v_num, v_txt, an.unit_ucum,
      rng.ref_low, rng.ref_high, rng.crit_low, rng.crit_high,
      CASE an.value_type
        WHEN 'ordinal' THEN array_to_string(an.normal_values, ' / ')
        WHEN 'text'    THEN rng.normal_text
      END,
      v_flag, p_source, p_analyzer, v_actor
    );

    IF v_flag NOT IN ('critical_high', 'critical_low') THEN
      PERFORM withdraw_stale_critical(p_order_id, an.id, v_num);
    END IF;

    n_written := n_written + 1;
    IF v_flag IN ('critical_high', 'critical_low') THEN n_crit := n_crit + 1; END IF;
  END LOOP;

  UPDATE lab_orders
     SET status = 'processing', verified_by = NULL, verified_at = NULL
   WHERE id = p_order_id
     AND (
       status IN ('collected', 'processing', 'verified', 'reported')
       OR (p_source <> 'manual' AND status = 'ordered')
     );

  written := n_written;
  critical := n_crit;
  RETURN NEXT;
END $$;

-- ── 6. The entry form shows every line's normal ─────────────────────────────
-- As 0178, plus normal_values (so the screen judges grades exactly as the
-- database does, not by "the first option") and normal_text.
DROP FUNCTION IF EXISTS get_order_analyte_form(uuid);
CREATE FUNCTION get_order_analyte_form(p_order_id uuid)
RETURNS TABLE (
  test_id        uuid,
  test_name      text,
  analyte_id     uuid,
  code           text,
  name           text,
  short_name     text,
  unit_ucum      text,
  decimals       int,
  display_order  int,
  value_type     text,
  allowed_values text[],
  normal_values  text[],
  normal_text    text,
  ref_low        numeric,
  ref_high       numeric,
  crit_low       numeric,
  crit_high      numeric,
  value_num      numeric,
  value_text     text,
  flag           text
)
LANGUAGE sql STABLE AS $$
  WITH o AS (
    SELECT lo.id, lo.tenant_id, lo.patient_id, COALESCE(lo.ordered_at, now()) AS taken
      FROM lab_orders lo WHERE lo.id = p_order_id
  ),
  pt AS (
    SELECT p.gender AS sex,
           GREATEST(0, ((SELECT taken FROM o)::date - p.dob))::int AS age_days
      FROM patients p WHERE p.id = (SELECT patient_id FROM o)
  )
  SELECT
    c.id, c.name,
    a.id, a.code, a.name, a.short_name, a.unit_ucum, a.decimals, ta.display_order,
    a.value_type, a.allowed_values, a.normal_values, r.normal_text,
    r.ref_low, r.ref_high, r.crit_low, r.crit_high,
    res.value_num, res.value_text, COALESCE(res.flag, 'pending')
  FROM lab_order_items loi
  JOIN lab_tests_catalog c   ON c.id = loi.test_id
  JOIN lab_test_analytes ta  ON ta.lab_master_id = c.lab_master_id
  JOIN lab_analytes a        ON a.id = ta.analyte_id AND a.is_active
  CROSS JOIN pt
  LEFT JOIN LATERAL resolve_reference_range(
      a.id, (SELECT tenant_id FROM o), pt.sex, pt.age_days) r ON true
  LEFT JOIN lab_result_analytes res
      ON res.lab_order_id = p_order_id AND res.test_id = c.id AND res.analyte_id = a.id
  WHERE loi.lab_order_id = p_order_id
  ORDER BY c.name, ta.display_order
$$;
REVOKE ALL ON FUNCTION get_order_analyte_form(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_order_analyte_form(uuid) TO authenticated, service_role;

-- ── 7. The report prints every line's normal ────────────────────────────────
-- As 0277, plus normal_text: the one stored with the result; for a line not
-- yet answered (or a result from before this), the normal in force now.
DROP FUNCTION IF EXISTS public.get_lab_report_analytes(uuid);
CREATE FUNCTION public.get_lab_report_analytes(p_order_id uuid)
 RETURNS TABLE(department text, test_id uuid, test_name text, test_code text, sample_type text,
               referred_to text, referred_nabl text, analyte_id uuid, name text, short_name text,
               unit_ucum text, decimals integer, value_type text, display_order integer,
               value_num numeric, value_text text, ref_low numeric, ref_high numeric,
               normal_text text, flag text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(c.department, 'Clinical Biochemistry'),
         c.id, c.name, c.code, c.sample_type,
         rl.name, rl.nabl_number,
         a.id, a.name, a.short_name,
         COALESCE(r.unit_ucum, a.unit_ucum), a.decimals, a.value_type,
         ta.display_order,
         r.value_num, r.value_text, r.ref_low, r.ref_high,
         COALESCE(
           r.normal_text,
           CASE a.value_type
             WHEN 'ordinal' THEN array_to_string(a.normal_values, ' / ')
             WHEN 'text' THEN (
               SELECT rr.normal_text FROM lab_reference_ranges rr
                WHERE rr.analyte_id = a.id AND rr.normal_text IS NOT NULL
                  AND (rr.tenant_id IS NULL OR rr.tenant_id = i.tenant_id)
                ORDER BY (rr.tenant_id IS NOT NULL) DESC, rr.created_at DESC
                LIMIT 1)
           END),
         COALESCE(r.flag, 'pending')
    FROM lab_order_items i
    JOIN lab_tests_catalog c  ON c.id = i.test_id
    JOIN lab_test_analytes ta ON ta.lab_master_id = c.lab_master_id
    JOIN lab_analytes a       ON a.id = ta.analyte_id
    LEFT JOIN lab_result_analytes r
           ON r.lab_order_id = i.lab_order_id
          AND r.test_id      = i.test_id
          AND r.analyte_id   = a.id
    LEFT JOIN lab_referral_labs rl ON rl.id = c.referral_lab_id
   WHERE i.lab_order_id = p_order_id
     AND (
       EXISTS (SELECT 1 FROM lab_result_analytes r2
                WHERE r2.lab_order_id = i.lab_order_id AND r2.test_id = i.test_id)
       OR (i.result_value IS NULL AND i.result_text IS NULL)
     )
     AND NOT (
       r.value_num IS NULL AND COALESCE(r.value_text, '') = ''
       AND EXISTS (SELECT 1 FROM lab_optional_analytes o
                    WHERE o.tenant_id = i.tenant_id
                      AND o.test_id = i.test_id
                      AND o.analyte_id = a.id)
     )
   ORDER BY CASE COALESCE(c.department, 'Clinical Biochemistry')
              WHEN 'Haematology'                    THEN 1
              WHEN 'Clinical Biochemistry'          THEN 2
              WHEN 'Clinical Pathology'             THEN 3
              WHEN 'Microbiology & Serology'        THEN 4
              WHEN 'Immunohaematology (Blood Bank)' THEN 5
              WHEN 'Molecular Biology'              THEN 6
              ELSE 7
            END,
            c.name, ta.display_order
$function$;
REVOKE ALL ON FUNCTION public.get_lab_report_analytes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lab_report_analytes(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.get_lab_report_analytes(uuid) IS
  'Every analyte the order''s panels are defined to measure, with its result where one exists and flag ''pending'' where none does, and the normal each line is read against. Driven from the order rather than from the results, so an unmeasured analyte is visible instead of absent.';

-- ── 8. Results from an analyzer that is not live are held ───────────────────
ALTER TABLE analyzer_messages DROP CONSTRAINT IF EXISTS analyzer_messages_status_check;
ALTER TABLE analyzer_messages ADD CONSTRAINT analyzer_messages_status_check
  CHECK (status = ANY (ARRAY['received','parsed','matched','unmatched','unmapped','failed','ignored','held']));

CREATE OR REPLACE FUNCTION get_unmatched_messages()
RETURNS TABLE (
  id             uuid,
  received_at    timestamptz,
  sample_barcode text,
  analyzer_label text,
  patient_name   text,
  result_count   int,
  status         text,
  error          text
)
LANGUAGE sql STABLE AS $$
  SELECT msg.id,
         msg.received_at,
         msg.sample_barcode,
         COALESCE(
           NULLIF(trim(COALESCE(a.manufacturer, '') || ' ' || COALESCE(a.model, '')), ''),
           a.fingerprint,
           'Unidentified analyzer'
         ),
         msg.parsed_json ->> 'patientName',
         COALESCE(jsonb_array_length(msg.parsed_json -> 'results'), 0),
         msg.status,
         msg.error
    FROM analyzer_messages msg
    LEFT JOIN lab_analyzers a ON a.id = msg.analyzer_id
   WHERE msg.status IN ('unmatched', 'unmapped', 'failed', 'held')
   ORDER BY msg.received_at DESC;
$$;

COMMIT;
