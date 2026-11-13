-- Two small report fixes on top of 0298, found checking the printed flags.
--
-- 1. A written line typed exactly as its written normal — Colour "Pale
--    yellow", Casts "Nil" — printed no flag, as if it had not been judged. It
--    is now 'normal'. Nothing else about written lines changes: words that
--    differ from the normal still carry no verdict, and are never flagged
--    abnormal automatically.
--
-- 2. A number line not yet answered (an interim report) printed no range,
--    while graded and written lines printed their normal. It now prints the
--    range that will apply to this patient. A line that HAS a result still
--    prints the range kept with it.

BEGIN;

-- ── 1. Saving: written line equal to its normal is 'normal' ─────────────────
-- As 0298; only the 'text' branch of the flag changes.
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
      -- A written line typed exactly as its written normal ("Nil", "Pale
      -- yellow") is normal. Anything else carries no verdict: words cannot be
      -- judged safely, so a written line is never flagged abnormal by itself.
      WHEN an.value_type = 'text' THEN
        CASE WHEN rng.normal_text IS NOT NULL
                  AND lower(btrim(v_txt)) = lower(btrim(rng.normal_text)) THEN 'normal'
             ELSE 'unranged' END
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

-- ── 2. The report: unanswered number lines show the range that will apply ──
-- As 0298. A line with a result keeps its stored snapshot; a line with none
-- shows the range resolved for this patient now (resolve_reference_range, the
-- same one saving uses), and so does a written line saved before 0298.
CREATE OR REPLACE FUNCTION public.get_lab_report_analytes(p_order_id uuid)
 RETURNS TABLE(department text, test_id uuid, test_name text, test_code text, sample_type text,
               referred_to text, referred_nabl text, analyte_id uuid, name text, short_name text,
               unit_ucum text, decimals integer, value_type text, display_order integer,
               value_num numeric, value_text text, ref_low numeric, ref_high numeric,
               normal_text text, flag text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH o AS (
    SELECT lo.tenant_id, lo.patient_id, COALESCE(lo.ordered_at, now()) AS taken
      FROM lab_orders lo WHERE lo.id = p_order_id
  ),
  pt AS (
    SELECT p.gender AS sex,
           GREATEST(0, ((SELECT taken FROM o)::date - p.dob))::int AS age_days
      FROM patients p WHERE p.id = (SELECT patient_id FROM o)
  )
  SELECT COALESCE(c.department, 'Clinical Biochemistry'),
         c.id, c.name, c.code, c.sample_type,
         rl.name, rl.nabl_number,
         a.id, a.name, a.short_name,
         COALESCE(r.unit_ucum, a.unit_ucum), a.decimals, a.value_type,
         ta.display_order,
         r.value_num, r.value_text,
         CASE WHEN r.analyte_id IS NULL THEN cur.ref_low  ELSE r.ref_low  END,
         CASE WHEN r.analyte_id IS NULL THEN cur.ref_high ELSE r.ref_high END,
         COALESCE(
           r.normal_text,
           CASE a.value_type
             WHEN 'ordinal' THEN array_to_string(a.normal_values, ' / ')
             WHEN 'text'    THEN cur.normal_text
           END),
         COALESCE(r.flag, 'pending')
    FROM lab_order_items i
    JOIN lab_tests_catalog c  ON c.id = i.test_id
    JOIN lab_test_analytes ta ON ta.lab_master_id = c.lab_master_id
    JOIN lab_analytes a       ON a.id = ta.analyte_id
    LEFT JOIN pt ON true
    LEFT JOIN LATERAL resolve_reference_range(a.id, i.tenant_id, pt.sex, pt.age_days) cur ON true
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

COMMIT;
