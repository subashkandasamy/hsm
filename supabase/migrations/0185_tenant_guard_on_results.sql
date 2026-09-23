-- Move the cross-hospital check out of TypeScript and into the database.
--
-- ── Why this is not belt-and-braces ────────────────────────────────────────
--
-- Tube barcodes are NOT unique across hospitals, and that is deliberate.
-- lab_accession_seq is keyed (tenant_id, day) and restarts at 0001 every
-- morning for every hospital, so a six-digit date plus four digits stays short
-- enough for a technician to read aloud. The consequence:
--
--   Uyirly Demo, 23 Sep 2026, first tube  →  260923000101
--   AES Health,  23 Sep 2026, first tube  →  260923000101   ← the same sticker
--
-- The ingest route resolves a barcode with .eq('tenant_id', …), and that single
-- filter is the only thing keeping one hospital's haemoglobin off another
-- hospital's patient. It runs as the service role, where RLS is switched off
-- and current_tenant_id() is NULL, so nothing downstream would catch a mistake.
--
-- Encoding the agreement here means it protects every future caller — a bulk
-- import, a second connector, whatever we build next year — and fails loudly
-- instead of silently writing to a stranger.
--
-- The parameter is optional because the UI does not need it: those calls run as
-- the signed-in user, where RLS already refuses another hospital's order. It is
-- for headless callers, which have no such protection.

-- Adding a parameter creates an OVERLOAD, it does not replace. Two candidates
-- would make every existing four-argument call ambiguous, which is exactly the
-- PGRST203/201 family of failure that has silently emptied screens here before.
-- So the old signature goes first.
DROP FUNCTION IF EXISTS save_lab_analyte_results(uuid, jsonb, text, uuid);

CREATE FUNCTION save_lab_analyte_results(
  p_order_id uuid,
  p_items    jsonb,
  p_source   text DEFAULT 'manual',
  p_analyzer uuid DEFAULT NULL,
  -- Who the caller believes this order belongs to. Checked, never trusted as
  -- the value to write: the row still takes its tenant from the order itself.
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

  -- The guard. A connector belonging to one hospital may not write onto
  -- another's order, however it arrived at the id.
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

  UPDATE lab_orders
     SET status = 'processing', verified_by = NULL, verified_at = NULL
   WHERE id = p_order_id
     AND status IN ('collected', 'processing', 'verified', 'reported');

  written := n_written;
  critical := n_crit;
  RETURN NEXT;
END $$;

-- ── The same guard for the tube writer ─────────────────────────────────────
--
-- ensure_lab_samples has only UI callers today, where RLS covers it. It gets
-- the parameter anyway, because the moment anything headless calls it — an
-- import, a connector asking which tests are on a tube — the protection has to
-- already be there rather than be remembered.

DROP FUNCTION IF EXISTS ensure_lab_samples(uuid);

CREATE FUNCTION ensure_lab_samples(p_order_id uuid, p_tenant_id uuid DEFAULT NULL)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  v_tenant    uuid;
  v_accession text;
  v_next      int;
  r           record;
  v_sample    uuid;
  n_new       int := 0;
BEGIN
  SELECT tenant_id, accession_no INTO v_tenant, v_accession
    FROM lab_orders WHERE id = p_order_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Lab order % not found', p_order_id USING ERRCODE = 'no_data_found';
  END IF;

  IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'Lab order % belongs to another hospital', p_order_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(MAX(tube_no), 0) INTO v_next FROM lab_samples WHERE lab_order_id = p_order_id;

  FOR r IN
    SELECT COALESCE(c.tube_type, 'other') AS tube_type,
           MIN(tt.draw_order) AS draw_order,
           array_agg(c.id) AS test_ids
      FROM lab_order_items loi
      JOIN lab_tests_catalog c ON c.id = loi.test_id
      LEFT JOIN lab_tube_types tt ON tt.code = c.tube_type
     WHERE loi.lab_order_id = p_order_id
     GROUP BY COALESCE(c.tube_type, 'other')
     ORDER BY MIN(tt.draw_order) NULLS LAST
  LOOP
    SELECT id INTO v_sample FROM lab_samples
     WHERE lab_order_id = p_order_id AND tube_type = r.tube_type;

    IF v_sample IS NULL THEN
      v_next := v_next + 1;
      v_sample := gen_random_uuid();
      INSERT INTO lab_samples (id, tenant_id, lab_order_id, tube_no, tube_type, barcode)
      VALUES (v_sample, v_tenant, p_order_id, v_next, r.tube_type,
              COALESCE(v_accession, '') || lpad(v_next::text, 2, '0'));
      n_new := n_new + 1;
    END IF;

    INSERT INTO lab_sample_items (id, tenant_id, sample_id, test_id)
    SELECT gen_random_uuid(), v_tenant, v_sample, t
      FROM unnest(r.test_ids) AS t
    ON CONFLICT (sample_id, test_id) DO NOTHING;
  END LOOP;

  RETURN n_new;
END $$;
