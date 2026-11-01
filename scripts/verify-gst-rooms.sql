-- Which rooms the GST room-rent rule will actually tax, and which ones it
-- cannot classify. Read-only; raises by design, so it cannot alter anything.
--
--   psql "$DATABASE_URL" -f scripts/verify-gst-rooms.sql
--
-- The rule (47th GST Council, effective 18 July 2022): 5% without ITC on a
-- non-ICU room charged ABOVE Rs 5,000 per day. Exactly Rs 5,000 is exempt.
--
-- The row worth looking for is the third count. `roomRentGstRate` treats a
-- room whose type is unknown as exempt rather than taxing it on a guess, so an
-- unclassified ward over Rs 5,000 is the one case where the hospital would
-- silently under-collect. It is invisible from the invoice, which is why it is
-- counted here rather than left to be noticed.

DO $$
DECLARE
  v_taxable int;
  v_icu_exempt int;
  v_unclassified int;
  v_at_threshold int;
  v_detail text := '';
  r record;
BEGIN
  SELECT
    count(*) FILTER (WHERE rt.is_icu = false AND w.daily_rate > 5000),
    count(*) FILTER (WHERE rt.is_icu = true  AND w.daily_rate > 5000),
    count(*) FILTER (WHERE rt.is_icu IS NULL AND w.daily_rate > 5000),
    count(*) FILTER (WHERE w.daily_rate = 5000)
  INTO v_taxable, v_icu_exempt, v_unclassified, v_at_threshold
  FROM wards w
  LEFT JOIN ward_room_types rt ON rt.id = w.room_type_id;

  -- Name every room the rule touches, in either direction, so the list can be
  -- handed to whoever signs the returns.
  FOR r IN
    SELECT t.slug, w.name, w.daily_rate, rt.is_icu,
           coalesce(tp.gst_enabled, false) AS gst_on
      FROM wards w
      JOIN tenants t ON t.id = w.tenant_id
      LEFT JOIN ward_room_types rt ON rt.id = w.room_type_id
      LEFT JOIN tenant_profiles tp ON tp.tenant_id = w.tenant_id
     WHERE w.daily_rate >= 5000
     ORDER BY t.slug, w.daily_rate DESC
  LOOP
    v_detail := v_detail || format(E'\n    %s / %s  Rs %s  %s  %s',
      r.slug, r.name, r.daily_rate,
      CASE WHEN r.is_icu IS NULL THEN 'UNCLASSIFIED'
           WHEN r.is_icu THEN 'ICU (exempt)'
           WHEN r.daily_rate > 5000 THEN 'taxable 5%'
           ELSE 'at threshold (exempt)' END,
      CASE WHEN r.gst_on THEN '' ELSE '[tenant GST off]' END);
  END LOOP;

  RAISE EXCEPTION E'\n'
    'GST ROOM RENT\n'
    '  taxable (non-ICU > Rs 5,000) : %\n'
    '  ICU, exempt at any rate      : %\n'
    '  UNCLASSIFIED > Rs 5,000      : %   <- must be 0; these are treated as exempt\n'
    '  sitting on exactly Rs 5,000  : %   (exempt — the rule says "above")\n'
    '\n  rooms at or above Rs 5,000:%',
    v_taxable, v_icu_exempt, v_unclassified, v_at_threshold,
    CASE WHEN v_detail = '' THEN ' none' ELSE v_detail END;
END $$;
