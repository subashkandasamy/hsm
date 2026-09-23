-- An analyzer result means the sample was drawn, whatever the software thinks.
--
-- ── The defect ─────────────────────────────────────────────────────────────
--
-- save_lab_analyte_results advances an order to 'processing' only from
-- collected / processing / verified / reported. 'ordered' was left out, and
-- correctly so for manual entry: a technician typing results against a sample
-- nobody has collected is a mistake, and the function refuses it outright.
--
-- But an analyzer is not a technician. It only ever reports on a tube that was
-- physically drawn, put in the machine and run. In a small laboratory nobody
-- stops to press 'collect' in between — the connector exists precisely to
-- paper over that gap. So the results were written and the order stayed at
-- 'ordered'.
--
-- The lab worklist is tabbed by exactly those statuses, so the order sat in
-- "Awaiting collection" carrying finished results. Nobody looks there for
-- something to authorise, which means the results were invisible: stored,
-- flagged, and never seen. Found by sending a message for an order that had
-- not been marked collected — which is the ordinary case, not an edge one.
--
-- The fix is to let a non-manual source advance an order from 'ordered' too.
-- Manual entry keeps its gate; it is still refused before reaching here.
--
-- Deliberately NOT done: back-dating lab_samples.collected_at. We know the
-- sample was drawn, but not when or by whom, and inventing a collection time
-- in a record an assessor reads is worse than leaving it blank.

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
  n_written  int := 0;
  n_crit     int := 0;
BEGIN
  SELECT o.tenant_id, o.patient_id, o.status, COALESCE(o.ordered_at, now())
    INTO v_tenant, v_patient, v_status, v_taken
    FROM lab_orders o WHERE o.id = p_order_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Lab order % not found', p_order_id USING ERRCODE = 'no_data_found';
  END IF;

  -- A connector belonging to one hospital may not write onto another's order,
  -- however it arrived at the id. Barcodes repeat across hospitals by design.
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

  -- Authorisation is withdrawn on every write, whoever made it: a result that
  -- has changed has not been checked by anybody yet.
  UPDATE lab_orders
     SET status = 'processing', verified_by = NULL, verified_at = NULL
   WHERE id = p_order_id
     AND (
       status IN ('collected', 'processing', 'verified', 'reported')
       -- A machine only reports on a tube that was drawn and run, so its word
       -- is enough to move an order that nobody marked collected.
       OR (p_source <> 'manual' AND status = 'ordered')
     );

  written := n_written;
  critical := n_crit;
  RETURN NEXT;
END $$;

-- Orders that already hit this: results present, still sitting in the
-- "awaiting collection" tab where nobody would look for them.
UPDATE lab_orders o
   SET status = 'processing'
 WHERE o.status = 'ordered'
   AND EXISTS (
     SELECT 1 FROM lab_result_analytes ra
      WHERE ra.lab_order_id = o.id AND ra.source <> 'manual'
   );
