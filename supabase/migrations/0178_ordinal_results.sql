-- Teach saving and the entry form about analytes that are not numbers.
--
-- A urine strip reports protein as Negative / Trace / 1+ / 2+ / 3+. "Normal" is
-- membership of a set, not a position between a low and a high, so the numeric
-- path cannot judge it. Colour is free text and has no verdict at all — and
-- claiming one would be worse than leaving it blank.

CREATE OR REPLACE FUNCTION save_lab_analyte_results(
  p_order_id uuid,
  p_items    jsonb,
  p_source   text DEFAULT 'manual',
  p_analyzer uuid DEFAULT NULL
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
  n_written  int := 0;
  n_crit     int := 0;
BEGIN
  SELECT o.tenant_id, o.patient_id, o.status, COALESCE(o.ordered_at, now())
    INTO v_tenant, v_patient, v_status, v_taken
    FROM lab_orders o WHERE o.id = p_order_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Lab order % not found', p_order_id USING ERRCODE = 'no_data_found';
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

    v_num := NULLIF(it->>'value_num', '')::numeric;
    v_txt := NULLIF(it->>'value_text', '');

    SELECT * INTO rng FROM resolve_reference_range(an.id, v_tenant, v_sex, v_age_days);

    v_flag := CASE
      WHEN v_num IS NULL AND v_txt IS NULL THEN 'pending'

      -- An ordered scale: normal is membership, not position.
      WHEN an.value_type = 'ordinal' THEN
        CASE WHEN an.normal_values IS NULL THEN 'unranged'
             WHEN v_txt = ANY (an.normal_values) THEN 'normal'
             ELSE 'abnormal' END

      -- Free text — colour, appearance, "2-3 /hpf". No verdict is honest.
      WHEN an.value_type = 'text' THEN 'unranged'

      -- Numeric. Critical before reference, because a potassium of 7.0 and one
      -- of 5.2 are not the same fact.
      WHEN v_num IS NULL THEN 'abnormal'
      WHEN rng.crit_high IS NOT NULL AND v_num >= rng.crit_high THEN 'critical_high'
      WHEN rng.crit_low  IS NOT NULL AND v_num <= rng.crit_low  THEN 'critical_low'
      WHEN rng.ref_high  IS NOT NULL AND v_num >  rng.ref_high  THEN 'high'
      WHEN rng.ref_low   IS NOT NULL AND v_num <  rng.ref_low   THEN 'low'
      WHEN rng.ref_low IS NOT NULL OR rng.ref_high IS NOT NULL   THEN 'normal'
      ELSE 'unranged'
    END;

    INSERT INTO lab_result_analytes (
      tenant_id, lab_order_id, test_id, analyte_id,
      value_num, value_text, unit_ucum,
      ref_low, ref_high, crit_low, crit_high,
      flag, source, analyzer_id, entered_by
    ) VALUES (
      v_tenant, p_order_id, (it->>'test_id')::uuid, an.id,
      v_num, v_txt, an.unit_ucum,
      rng.ref_low, rng.ref_high, rng.crit_low, rng.crit_high,
      v_flag, p_source, p_analyzer, v_actor
    )
    ON CONFLICT (lab_order_id, test_id, analyte_id, created_at) DO NOTHING;

    n_written := n_written + 1;
    IF v_flag IN ('critical_high', 'critical_low') THEN n_crit := n_crit + 1; END IF;
  END LOOP;

  UPDATE lab_orders
     SET status = 'processing', verified_by = NULL, verified_at = NULL
   WHERE id = p_order_id
     AND status IN ('collected', 'processing', 'verified', 'reported');

  written := n_written;
  critical := n_crit;
  RETURN NEXT;
END $$;

-- The form needs to know which control to draw: a number box, a dropdown of the
-- strip's own scale, or a free-text field.
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
    a.value_type, a.allowed_values,
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
