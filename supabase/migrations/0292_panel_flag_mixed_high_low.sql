-- Two lab fixes from the E2E run of 12 Nov 2026.
--
-- BUG-024: a CBC with Hb 11 (low) and WBC 15.2 / neutrophils
-- 84 (high) showed only "LOW" on the order card. roll_up_panel_flag (0229)
-- takes the single worst flag, and high and low rank the same, so whichever
-- sorted first won. When a panel has both, it is now 'abnormal' — the card
-- reads ABNORMAL and the technician opens it to see which.
--
-- Forward only: existing rows keep their flag until their results are saved
-- again (no backfill — it would rewrite other hospitals' stored flags).

CREATE OR REPLACE FUNCTION roll_up_panel_flag() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_flag text;
  v_high boolean;
  v_low  boolean;
BEGIN
  SELECT (ARRAY_AGG(r.flag ORDER BY lab_flag_severity(r.flag)))[1],
         bool_or(r.flag = 'high'),
         bool_or(r.flag = 'low')
    INTO v_flag, v_high, v_low
    FROM lab_result_analytes r
   WHERE r.lab_order_id = COALESCE(NEW.lab_order_id, OLD.lab_order_id)
     AND r.test_id      = COALESCE(NEW.test_id, OLD.test_id)
     AND (r.value_num IS NOT NULL OR COALESCE(r.value_text,'') <> '');

  IF v_flag IN ('high', 'low') AND v_high AND v_low THEN
    v_flag := 'abnormal';
  END IF;

  UPDATE lab_order_items
     SET flag = COALESCE(v_flag, 'pending')
   WHERE lab_order_id = COALESCE(NEW.lab_order_id, OLD.lab_order_id)
     AND test_id      = COALESCE(NEW.test_id, OLD.test_id);

  RETURN NULL;
END $$;

COMMENT ON FUNCTION roll_up_panel_flag() IS
  'Keeps lab_order_items.flag equal to the worst flag among that panel''s measured analytes (''abnormal'' when it has both high and low), so the EMR timeline and anything else reading the item row sees what the panel actually showed.';

-- BUG-025: the critical-results bar showed "Random Blood Sugar mg/dL" with no
-- 480. A single-analyte test (RBS) is saved through the analyte path, which
-- queued the alert with its value; the roll-up above then set the item's flag
-- to critical_high, and log_critical_item_result (0230) queued a SECOND entry
-- keyed on the test, with NEW.result_value NULL. It now ignores items with no
-- value of their own. (listOpenCriticalResults also hides such rows already
-- queued, so nothing is deleted here.)

CREATE OR REPLACE FUNCTION log_critical_item_result() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_doctor uuid; v_tenant uuid;
BEGIN
  IF NEW.flag NOT IN ('critical_high', 'critical_low') THEN
    RETURN NEW;
  END IF;
  -- A panel's value lives in lab_result_analytes, which queues its own entry
  -- (with the value). The flag rolled up onto the item (0229) is not a second
  -- critical result — it queued a duplicate with no value (BUG-025).
  IF NEW.result_value IS NULL THEN
    RETURN NEW;
  END IF;

  -- Back to critical: reopen rather than queue a second telephone call.
  UPDATE lab_critical_notifications
     SET withdrawn_at = NULL, withdrawn_reason = NULL, value_num = NEW.result_value
   WHERE lab_order_id = NEW.lab_order_id
     AND test_id      = NEW.test_id
     AND NOT acknowledged
     AND withdrawn_at IS NOT NULL;
  IF FOUND THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM lab_critical_notifications n
     WHERE n.lab_order_id = NEW.lab_order_id
       AND n.test_id = NEW.test_id
       AND NOT n.acknowledged
  ) THEN
    RETURN NEW;
  END IF;

  SELECT ordered_by, tenant_id INTO v_doctor, v_tenant
    FROM lab_orders WHERE id = NEW.lab_order_id;

  INSERT INTO lab_critical_notifications
    (id, tenant_id, lab_order_id, analyte_id, test_id, value_num, notified_to)
  VALUES
    (gen_random_uuid(), v_tenant, NEW.lab_order_id, NULL, NEW.test_id,
     NEW.result_value, v_doctor);

  RETURN NEW;
END $$;
