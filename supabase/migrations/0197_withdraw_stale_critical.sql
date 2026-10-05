-- A corrected result left the telephone call standing.
--
-- 0196 made a re-entered result REPLACE the one before it, which is what a
-- laboratory means by a correction. That exposed something the critical-value
-- queue had been hiding behind the duplicates.
--
-- log_critical_result fires AFTER INSERT and nothing fires on delete. So:
--
--   technician types potassium 7.2  → row stored, alert raised
--   technician sees the typo, 4.1   → row replaced, alert untouched
--
-- The order now holds a normal potassium and the queue still demands somebody
-- telephone a doctor about 7.2 — a value that exists nowhere in the database.
-- The only way to clear it is to record who was told, which would be a lie in
-- the one register an assessor reads.
--
-- Proven on a copy before writing this: stored value 4.1 (normal), queue still
-- saying 6.8.
--
-- ── Withdrawn, not deleted ─────────────────────────────────────────────────
--
-- The entry is kept and marked. A critical value that appeared and was taken
-- back is exactly the sort of thing NABL 112 §5.8 expects a laboratory to be
-- able to show, and deleting the row would leave no evidence either way.
-- Only an UNACKNOWLEDGED entry can be withdrawn: once somebody has written
-- down that they made the call, that call happened and stands.

ALTER TABLE lab_critical_notifications
  ADD COLUMN IF NOT EXISTS withdrawn_at     timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_reason text;

COMMENT ON COLUMN lab_critical_notifications.withdrawn_at IS
  'Set when the result that raised this alert was corrected to a non-critical value before anyone was telephoned. The row stays as evidence; it leaves the queue.';

CREATE OR REPLACE FUNCTION withdraw_stale_critical(
  p_order_id uuid, p_analyte_id uuid, p_new_value numeric
) RETURNS void LANGUAGE sql AS $$
  UPDATE lab_critical_notifications
     SET withdrawn_at = now(),
         withdrawn_reason = 'Result corrected to '
           || COALESCE(p_new_value::text, 'no value') || ' before the clinician was contacted'
   WHERE lab_order_id = p_order_id
     AND analyte_id   = p_analyte_id
     AND NOT acknowledged
     AND withdrawn_at IS NULL;
$$;

-- Same function as 0196, with one addition at the end of the loop.
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

    v_test := (it->>'test_id')::uuid;
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

    -- Replace, explicitly. ON CONFLICT cannot do this: the only unique index
    -- the partitioning allows includes created_at, which differs every time.
    --
    -- A correction is meant to supersede what it corrects — a laboratory that
    -- retypes a potassium expects one potassium afterwards, not two.
    DELETE FROM lab_result_analytes
     WHERE lab_order_id = p_order_id AND test_id = v_test AND analyte_id = an.id;

    INSERT INTO lab_result_analytes (
      tenant_id, lab_order_id, test_id, analyte_id,
      value_num, value_text, unit_ucum,
      ref_low, ref_high, crit_low, crit_high,
      flag, source, analyzer_id, entered_by
    ) VALUES (
      v_tenant, p_order_id, v_test, an.id,
      v_num, v_txt, an.unit_ucum,
      rng.ref_low, rng.ref_high, rng.crit_low, rng.crit_high,
      v_flag, p_source, p_analyzer, v_actor
    );

    -- The correction has to reach the queue too. log_critical_result raises an
    -- alert on insert but nothing retracts one, so a value corrected down from
    -- critical would otherwise leave a standing instruction to telephone a
    -- doctor about a number that is no longer anywhere in the record.
    IF v_flag NOT IN ('critical_high', 'critical_low') THEN
      PERFORM withdraw_stale_critical(p_order_id, an.id, v_num);
    END IF;

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

-- An alert may only be raised again if it is not already standing OR withdrawn
-- and unacknowledged — otherwise correcting 7.2 → 4.1 → 7.2 would raise a
-- second call for the same analyte on the same order.
CREATE OR REPLACE FUNCTION log_critical_result() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_doctor uuid;
BEGIN
  IF NEW.flag NOT IN ('critical_high', 'critical_low') THEN
    RETURN NEW;
  END IF;

  -- A value that goes back to critical reopens the entry that was withdrawn
  -- rather than queueing a second telephone call for the same analyte.
  UPDATE lab_critical_notifications
     SET withdrawn_at = NULL, withdrawn_reason = NULL, value_num = NEW.value_num
   WHERE lab_order_id = NEW.lab_order_id
     AND analyte_id   = NEW.analyte_id
     AND NOT acknowledged
     AND withdrawn_at IS NOT NULL;
  IF FOUND THEN RETURN NEW; END IF;

  -- One open record per analyte per order: a corrected value that is still
  -- critical must not queue a second telephone call.
  IF EXISTS (
    SELECT 1 FROM lab_critical_notifications n
     WHERE n.lab_order_id = NEW.lab_order_id
       AND n.analyte_id = NEW.analyte_id
       AND NOT n.acknowledged
  ) THEN
    RETURN NEW;
  END IF;

  SELECT ordered_by INTO v_doctor FROM lab_orders WHERE id = NEW.lab_order_id;

  INSERT INTO lab_critical_notifications
    (id, tenant_id, lab_order_id, analyte_id, value_num, notified_to)
  VALUES
    (gen_random_uuid(), NEW.tenant_id, NEW.lab_order_id, NEW.analyte_id,
     NEW.value_num, v_doctor);

  RETURN NEW;
END $$;
