-- Saving a panel of results, in one transaction.
--
-- enterResults today loops over items doing one SELECT and one UPDATE each, in
-- no transaction, swallowing both validation failures and update errors. That
-- is 44 round trips for a single machine-produced CBC, and a failure halfway
-- leaves half a panel saved with the order in an indeterminate state (G13, G14,
-- G15). Doing the whole panel in one function call fixes all three at once.
--
-- It also puts the flagging rule in exactly one place. The old logic lived in
-- two — the client preview said 'pending' when a test had no range and the
-- server said 'normal' (G16) — and of those two answers the server's was the
-- dangerous one, because "normal" is a clinical statement we had no basis for.

-- A numeric value we hold no reference range for. Not 'normal': we have a
-- result and no opinion about it, and saying otherwise would be a lie the
-- report then prints.
ALTER TABLE lab_result_analytes DROP CONSTRAINT IF EXISTS lab_result_flag_check;
ALTER TABLE lab_result_analytes ADD CONSTRAINT lab_result_flag_check
  CHECK (flag = ANY (ARRAY[
    'pending','normal','high','low','critical_high','critical_low','abnormal','unranged'
  ]));

/**
 * Write a panel of analyte results for one order.
 *
 * p_items is [{ "test_id": uuid, "analyte_id": uuid,
 *               "value_num": number|null, "value_text": text|null }, ...]
 *
 * For each item the patient's own reference range is resolved — their sex, and
 * their age in days on the date the sample was taken, not today — and both the
 * range and the resulting flag are snapshotted onto the row, so a report
 * reprinted in two years shows the band that was actually applied.
 *
 * SECURITY INVOKER (the default) on purpose: every read and write here goes
 * through the caller's RLS, so a connector or a user can only ever touch its
 * own tenant's rows.
 */
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
  SELECT o.tenant_id, o.patient_id, COALESCE(o.ordered_at, now())
    INTO v_tenant, v_patient, v_taken
    FROM lab_orders o WHERE o.id = p_order_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Lab order % not found', p_order_id USING ERRCODE = 'no_data_found';
  END IF;

  SELECT p.gender, GREATEST(0, (v_taken::date - p.dob))::int
    INTO v_sex, v_age_days
    FROM patients p WHERE p.id = v_patient;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_num := NULLIF(it->>'value_num', '')::numeric;
    v_txt := NULLIF(it->>'value_text', '');

    SELECT * INTO rng FROM resolve_reference_range(
      (it->>'analyte_id')::uuid, v_tenant, v_sex, v_age_days);

    -- Critical first: a potassium of 7.0 and one of 5.2 are not the same fact.
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

    -- A text result carries no verdict unless somebody gave it one.
    IF v_num IS NULL AND v_txt IS NOT NULL THEN v_flag := 'abnormal'; END IF;

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

  -- Changing a value withdraws any authorisation it had, exactly as the
  -- single-value path does. A corrected result has to be looked at again.
  UPDATE lab_orders
     SET status = 'processing', verified_by = NULL, verified_at = NULL
   WHERE id = p_order_id
     AND status IN ('collected', 'processing', 'verified', 'reported');

  written := n_written;
  critical := n_crit;
  RETURN NEXT;
END $$;

COMMENT ON FUNCTION save_lab_analyte_results IS
  'Writes a whole panel in one transaction, resolving each analyte''s reference range for this patient''s sex and age and snapshotting it onto the result.';
