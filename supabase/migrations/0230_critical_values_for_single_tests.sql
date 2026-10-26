-- A test a hospital adds itself could never raise a critical alert.
--
-- Critical escalation lives entirely on the analyte path: the trigger is on
-- lab_result_analytes, the queue is keyed on analyte_id, and the ranges come
-- from lab_reference_ranges. A catalogue entry with no analytes behind it —
-- which is exactly what "a hospital's own local test" means, and what
-- createLabTest produces — went through lab_order_items instead, where:
--
--   * lab_tests_catalog had no crit_low or crit_high to compare against, so no
--     critical flag could be computed even in principle;
--   * the flag CHECK allowed only pending/normal/high/low, so one had nowhere
--     to be stored (widened in 0229); and
--   * no trigger watched the table, so nothing would have been queued anyway.
--
-- A potassium of 7.0 entered that way came out "high", appeared in no queue,
-- and telephoned nobody. Every test in the demo tenant happens to come from
-- the master catalogue with analytes attached, which is why this has never
-- shown — the first hospital to add its own test is the one it reaches.
--
-- lab_critical_notifications.analyte_id becomes nullable and gains a test_id
-- beside it: an entry now names either the analyte or the catalogue test it
-- came from, and exactly one of the two.

ALTER TABLE lab_tests_catalog
  ADD COLUMN IF NOT EXISTS crit_low  numeric,
  ADD COLUMN IF NOT EXISTS crit_high numeric;

COMMENT ON COLUMN lab_tests_catalog.crit_low IS
  'Below this, a result is critical and must be telephoned. Only used by tests with no analytes behind them; a panel''s thresholds live in lab_reference_ranges.';

ALTER TABLE lab_critical_notifications ALTER COLUMN analyte_id DROP NOT NULL;
ALTER TABLE lab_critical_notifications
  ADD COLUMN IF NOT EXISTS test_id uuid REFERENCES lab_tests_catalog(id) ON DELETE CASCADE;

ALTER TABLE lab_critical_notifications DROP CONSTRAINT IF EXISTS lab_critical_names_one_thing;
ALTER TABLE lab_critical_notifications ADD CONSTRAINT lab_critical_names_one_thing
  CHECK (num_nonnulls(analyte_id, test_id) = 1);

-- ── The same escalation, for a result that lives on the item ──────────────
--
-- Deliberately a mirror of log_critical_result rather than a generalisation of
-- it. The two paths read different tables for their thresholds and key their
-- queue entries on different columns, and folding them together would have
-- produced one function with two halves and a branch at the top.

CREATE OR REPLACE FUNCTION log_critical_item_result() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_doctor uuid; v_tenant uuid;
BEGIN
  IF NEW.flag NOT IN ('critical_high', 'critical_low') THEN
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

DROP TRIGGER IF EXISTS trg_log_critical_item ON lab_order_items;
CREATE TRIGGER trg_log_critical_item
AFTER INSERT OR UPDATE OF result_value, flag ON lab_order_items
FOR EACH ROW EXECUTE FUNCTION log_critical_item_result();

-- And the retraction, so a value corrected down leaves the queue rather than
-- standing as an instruction to telephone about a number no longer in the
-- record.
CREATE OR REPLACE FUNCTION withdraw_stale_critical_item(
  p_order_id uuid, p_test_id uuid, p_new_value numeric
) RETURNS void LANGUAGE sql AS $$
  UPDATE lab_critical_notifications
     SET withdrawn_at = now(),
         withdrawn_reason = 'Result corrected to '
           || COALESCE(p_new_value::text, 'no value') || ' before the clinician was contacted'
   WHERE lab_order_id = p_order_id
     AND test_id      = p_test_id
     AND NOT acknowledged
     AND withdrawn_at IS NULL;
$$;

COMMENT ON FUNCTION log_critical_item_result() IS
  'Queues a telephone call for a critical result on a test with no analytes behind it — the path a hospital''s own catalogue entry takes. Mirrors log_critical_result, which covers panels.';
