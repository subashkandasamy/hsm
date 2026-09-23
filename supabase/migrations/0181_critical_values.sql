-- Critical results, and telling somebody.
--
-- NABL 112 §5.8: the laboratory "shall establish and display critical limits
-- for tests which require immediate attention for patient management", and
-- results within them "shall be communicated to the concerned clinician after
-- proper documentation."
--
-- Both halves matter. We had the flag but no limits, so nothing ever became
-- critical — the feature existed and had never once fired. And a red flag on a
-- screen is not "communicated after proper documentation"; an assessor wants to
-- see who was told, when, and by whom.
--
-- ── Where these numbers come from ──────────────────────────────────────────
--
-- Widely published critical limits, and only the ones I can attribute. Note
-- that roughly half of a laboratory's critical list is institution-specific by
-- design — these are a starting point a hospital reviews and changes, exactly
-- like the reference ranges, not a standard handed down.
--
-- The analytes with no critical limit stay silent rather than guessing. A
-- wrong panic threshold is worse than none: too tight and the ward stops
-- answering the phone, too loose and the call never comes.

INSERT INTO lab_reference_ranges
  (id, tenant_id, analyte_id, sex, age_min_days, age_max_days,
   ref_low, ref_high, crit_low, crit_high, source, source_note)
SELECT gen_random_uuid(), NULL, a.id, 'any', 0, 54750,
       NULL, NULL, v.lo, v.hi, 'uyirly_standard',
       'Widely published critical (panic) limits — review and adjust for this hospital; about half of any critical list is institution-specific'
  FROM (VALUES
    ('HGB',   3.0,   NULL),    -- haemoglobin below 7.0 g/dL is the usual alert;
    ('PLT',  20.0, 1000.0),    -- platelets ≤20 or ≥1000 ×10⁹/L
    ('NA',  120.0,  160.0),    -- sodium, mEq/L
    ('K',     3.0,    6.1),    -- potassium, mEq/L
    ('RBSG', 55.0,  450.0),    -- glucose, mg/dL, adult
    ('FBG',  55.0,  450.0),
    ('PPBG', 55.0,  450.0)
  ) AS v(code, lo, hi)
  JOIN lab_analytes a ON a.code = v.code
 WHERE NOT EXISTS (
   SELECT 1 FROM lab_reference_ranges r
    WHERE r.analyte_id = a.id AND r.tenant_id IS NULL
      AND (r.crit_low IS NOT NULL OR r.crit_high IS NOT NULL));

-- Haemoglobin is the awkward one: its critical LOW is 7.0, but 7.0 also sits
-- inside the normal female range's lower reaches, so it needs its own row
-- rather than being folded into the sex-specific reference rows above.
UPDATE lab_reference_ranges SET crit_low = 7.0
 WHERE tenant_id IS NULL
   AND analyte_id = (SELECT id FROM lab_analytes WHERE code = 'HGB')
   AND crit_low = 3.0;

-- resolve_reference_range returns ONE row — the most specific — so a critical
-- limit sitting on a separate 'any' row would be invisible whenever a
-- sex-specific reference row won. Copy the critical limits onto the rows that
-- actually resolve.
UPDATE lab_reference_ranges tgt
   SET crit_low  = src.crit_low,
       crit_high = src.crit_high
  FROM lab_reference_ranges src
 WHERE src.tenant_id IS NULL
   AND src.analyte_id = tgt.analyte_id
   AND (src.crit_low IS NOT NULL OR src.crit_high IS NOT NULL)
   AND tgt.id <> src.id
   AND tgt.tenant_id IS NULL
   AND tgt.crit_low IS NULL AND tgt.crit_high IS NULL;

/**
 * Raise the notification record when a result comes back critical.
 *
 * Created unacknowledged, with the ordering doctor pre-filled as the person to
 * call, because they are who the laboratory rings. Nothing is auto-sent — a
 * critical result is communicated by a human picking up a telephone, and this
 * records that it happened.
 */
CREATE OR REPLACE FUNCTION log_critical_result() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_doctor uuid;
BEGIN
  IF NEW.flag NOT IN ('critical_high', 'critical_low') THEN
    RETURN NEW;
  END IF;

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

DROP TRIGGER IF EXISTS trg_log_critical_result ON lab_result_analytes;
CREATE TRIGGER trg_log_critical_result
  AFTER INSERT ON lab_result_analytes
  FOR EACH ROW EXECUTE FUNCTION log_critical_result();

COMMENT ON TABLE lab_critical_notifications IS
  'NABL 112 §5.8 — the record that a critical result was communicated to the clinician. Raised automatically when a result flags critical; closed by a person recording who they told and when.';
