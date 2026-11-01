-- Can the same charge be invoiced twice? Read-only; raises by design.
--
--   psql "$DATABASE_URL" -f scripts/verify-double-billing.sql
--
-- F-31 and F-50 are the same defect in two places: a charge is invoiced, and
-- the row it came from is not marked billed, so the unbilled-charges list
-- offers it again. Both had zero live instances, and in both cases the reason
-- was incidental rather than designed — a parent filter that happened to hide
-- the children, and a consultation_fee that happened to be 0. Incidental
-- protection is worth a standing check.
--
-- Every count below must be 0.

DO $$
DECLARE
  v_consumables int;
  v_visits int;
  v_ot int;
  v_orphan_sources text := '';
  r record;
BEGIN
  -- F-31: a consumable carried on a live bill but still flagged unbilled.
  SELECT count(*) INTO v_consumables
    FROM ot_consumables c
   WHERE c.billing_status <> 'billed'
     AND EXISTS (
       SELECT 1 FROM bill_items i JOIN bills b ON b.id = i.bill_id
        WHERE i.source = 'ot_consumable' AND i.ref_id = c.id AND b.status <> 'cancelled'
     );

  -- The same for the parent surgery, which has always had the column.
  SELECT count(*) INTO v_ot
    FROM ot_schedules s
   WHERE s.billing_status <> 'billed'
     AND EXISTS (
       SELECT 1 FROM bill_items i JOIN bills b ON b.id = i.bill_id
        WHERE i.source = 'ot' AND i.ref_id = s.id AND b.status <> 'cancelled'
     );

  -- F-50: a closed visit still 'unbilled' whose consultation is already on a
  -- live bill, by either route — `visit_id` (backfilled by startVisit) or
  -- `appointment_id` (how an appointment-stage line is actually keyed; its
  -- bill_items.ref_id is the APPOINTMENT id, so a ref-only check misses it).
  SELECT count(*) INTO v_visits
    FROM visits v
   WHERE v.status = 'closed'
     AND v.billing_status <> 'billed'
     AND EXISTS (
       SELECT 1
         FROM bills b
         JOIN bill_items i ON i.bill_id = b.id AND i.source = 'consultation'
        WHERE b.status <> 'cancelled'
          AND (b.visit_id = v.id OR (v.appointment_id IS NOT NULL AND b.appointment_id = v.appointment_id))
     );

  -- Any billed source with no table to flip. TABLE_MAP in generateBill must
  -- cover every source the preview can emit; this is the data-side echo of that
  -- invariant, and names anything that has reached a bill without one.
  FOR r IN
    SELECT DISTINCT i.source
      FROM bill_items i
     WHERE i.source NOT IN (
       -- flipped via TABLE_MAP
       'consultation','bed','lab','radiology','pharmacy','ipd_pharmacy',
       'ot','ot_consumable','blood','dental',
       -- written straight onto IPD daily / pharmacy-sale bills; no source row
       'icu','manual','nursing','nursing_morning','nursing_night',
       'pharmacy_sale_item','vaccine'
     )
  LOOP
    v_orphan_sources := v_orphan_sources || r.source || ' ';
  END LOOP;

  RAISE EXCEPTION E'\n'
    'DOUBLE BILLING\n'
    '  consumables billed but not flagged : %   <- F-31\n'
    '  surgeries billed but not flagged   : %\n'
    '  visits billed but not flagged      : %   <- F-50\n'
    '  bill sources with no known handling: %',
    v_consumables, v_ot, v_visits,
    CASE WHEN v_orphan_sources = '' THEN 'none' ELSE v_orphan_sources END;
END $$;
