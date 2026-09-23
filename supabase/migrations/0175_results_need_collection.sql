-- Results cannot be entered by hand on a sample nobody collected.
--
-- Collecting an OPD sample is gated on payment: collectSample refuses until the
-- linked bill is paid, unless the patient has an approved cashless claim. But
-- nothing gated entering RESULTS, so the gate could be walked around entirely —
-- skip collection, type the numbers, print the report. The hospital does the
-- work and never gets paid, and the sample has no recorded collection time,
-- which is also the thing a NABL assessor asks to see.
--
-- Inpatients are NOT gated, and this rule does not change that. An admitted
-- patient's charge was captured at order time and settles into the combined
-- bill at discharge, so their sample is collectable the moment it is drawn —
-- nobody should wait on a cash payment in a ward. Requiring collection before
-- results therefore costs an inpatient nothing: the collection step is always
-- available to them.
--
-- The rule is per source, and the difference matters:
--
--   manual   — a person must collect first. Refused on an uncollected order.
--   analyzer — never refused. A machine only reports on a sample that was
--              physically drawn and run, so the collection step was skipped in
--              the software, not in the laboratory. Discarding a real patient's
--              result to enforce a billing rule would be the wrong trade every
--              time; it is recorded, and the unpaid order stays visible as
--              unpaid.

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
    RAISE EXCEPTION 'Collect the sample before entering results'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'This order was cancelled' USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.gender, GREATEST(0, (v_taken::date - p.dob))::int
    INTO v_sex, v_age_days
    FROM patients p WHERE p.id = v_patient;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_num := NULLIF(it->>'value_num', '')::numeric;
    v_txt := NULLIF(it->>'value_text', '');

    SELECT * INTO rng FROM resolve_reference_range(
      (it->>'analyte_id')::uuid, v_tenant, v_sex, v_age_days);

    v_flag := CASE
      WHEN v_num IS NULL AND v_txt IS NULL THEN 'pending'
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
    )
    SELECT v_tenant, p_order_id, (it->>'test_id')::uuid, a.id,
           v_num, v_txt, a.unit_ucum,
           rng.ref_low, rng.ref_high, rng.crit_low, rng.crit_high,
           v_flag, p_source, p_analyzer, v_actor
      FROM lab_analytes a WHERE a.id = (it->>'analyte_id')::uuid
    ON CONFLICT (lab_order_id, test_id, analyte_id, created_at) DO NOTHING;

    n_written := n_written + 1;
    IF v_flag IN ('critical_high', 'critical_low') THEN n_crit := n_crit + 1; END IF;
  END LOOP;

  -- Changing a value withdraws any authorisation it had.
  UPDATE lab_orders
     SET status = 'processing', verified_by = NULL, verified_at = NULL
   WHERE id = p_order_id
     AND status IN ('collected', 'processing', 'verified', 'reported');

  written := n_written;
  critical := n_crit;
  RETURN NEXT;
END $$;
