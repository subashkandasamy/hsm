-- A panel's result never reached the row the rest of the product reads.
--
-- `lab_order_items.flag` is the one-word summary everything outside the
-- laboratory uses: the patient's EMR timeline reads it, and so does anything
-- that wants to know at a glance whether a test came back abnormal. For a
-- single test it is written when the result is typed.
--
-- For a panel it never is. A Complete Blood Count's twenty-eight numbers go to
-- lab_result_analytes and the item row keeps the 'pending' it was created
-- with — for ever, including after the report is released. In the demo tenant
-- a CBC on a reported order still reads flag 'pending', so a doctor opening
-- that patient's history sees every panel they have ever had marked as though
-- the laboratory had not started.
--
-- The fix is a roll-up: the worst flag among a panel's analytes becomes the
-- panel's flag. Worst, not latest — a potassium of 7.0 beside nineteen normal
-- results makes an abnormal panel, and summarising it any other way would bury
-- the one number that matters.
--
-- lab_order_items.flag only allowed four values, so critical ones had nowhere
-- to land. Widened to the same set lab_result_analytes uses, which is also
-- what 0230 needs to flag a critical single test.

ALTER TABLE lab_order_items DROP CONSTRAINT IF EXISTS lab_order_items_flag_check;
ALTER TABLE lab_order_items ADD CONSTRAINT lab_order_items_flag_check
  CHECK (flag = ANY (ARRAY['pending','normal','high','low',
                           'critical_high','critical_low','abnormal','unranged']));

-- How bad is a flag? Lower is worse, so MIN() picks the one to show.
CREATE OR REPLACE FUNCTION lab_flag_severity(p_flag text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_flag
    WHEN 'critical_high' THEN 1
    WHEN 'critical_low'  THEN 1
    WHEN 'abnormal'      THEN 2
    WHEN 'high'          THEN 3
    WHEN 'low'           THEN 3
    WHEN 'normal'        THEN 4
    WHEN 'unranged'      THEN 5
    ELSE 6                      -- 'pending', and anything unrecognised
  END
$$;

CREATE OR REPLACE FUNCTION roll_up_panel_flag() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_flag text;
BEGIN
  SELECT r.flag INTO v_flag
    FROM lab_result_analytes r
   WHERE r.lab_order_id = COALESCE(NEW.lab_order_id, OLD.lab_order_id)
     AND r.test_id      = COALESCE(NEW.test_id, OLD.test_id)
     AND (r.value_num IS NOT NULL OR COALESCE(r.value_text,'') <> '')
   ORDER BY lab_flag_severity(r.flag)
   LIMIT 1;

  UPDATE lab_order_items
     SET flag = COALESCE(v_flag, 'pending')
   WHERE lab_order_id = COALESCE(NEW.lab_order_id, OLD.lab_order_id)
     AND test_id      = COALESCE(NEW.test_id, OLD.test_id);

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_roll_up_panel_flag ON lab_result_analytes;
CREATE TRIGGER trg_roll_up_panel_flag
AFTER INSERT OR UPDATE OR DELETE ON lab_result_analytes
FOR EACH ROW EXECUTE FUNCTION roll_up_panel_flag();

-- Every panel already resulted has been carrying 'pending' since it was run.
UPDATE lab_order_items i
   SET flag = sub.worst
  FROM (
    SELECT r.lab_order_id, r.test_id,
           (ARRAY_AGG(r.flag ORDER BY lab_flag_severity(r.flag)))[1] AS worst
      FROM lab_result_analytes r
     WHERE r.value_num IS NOT NULL OR COALESCE(r.value_text,'') <> ''
     GROUP BY r.lab_order_id, r.test_id
  ) sub
 WHERE i.lab_order_id = sub.lab_order_id
   AND i.test_id      = sub.test_id
   AND i.flag IS DISTINCT FROM sub.worst;

COMMENT ON FUNCTION roll_up_panel_flag() IS
  'Keeps lab_order_items.flag equal to the worst flag among that panel''s measured analytes, so the EMR timeline and anything else reading the item row sees what the panel actually showed.';
