-- Drug search: let the trigram indexes do the work ───────────────────────────
-- Replaces search_drugs_v1 from 0156. A LIMIT pushed into an ILIKE scan made the
-- planner pick a sequential scan of drug_brands (242k rows, ~400 ms per term);
-- gathering each match set first keeps it on the trigram index (~6 ms).
CREATE OR REPLACE FUNCTION search_drugs_v1(p_query text, p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  t        text := lower(btrim(coalesce(p_query, '')));
  pat      text;
  pre      text;
  ids      uuid[];
  globals  jsonb;
  tenant   jsonb;
BEGIN
  IF length(t) < 2 THEN
    RETURN jsonb_build_object('globals', '[]'::jsonb, 'tenant', '[]'::jsonb);
  END IF;
  pat := '%' || t || '%';
  pre := t || '%';

  -- Candidates, best first: name/generic starting with the text, then a brand
  -- starting with it, then anything containing it.
  -- Each match set is gathered in a MATERIALIZED step: with the LIMIT pushed into
  -- the scan the planner mis-estimates ILIKE selectivity and scans the whole
  -- 242k-row brand table (measured 394 ms) instead of using the trigram index (6 ms).
  WITH name_pre AS MATERIALIZED (
    SELECT m.id, m.name FROM drug_master m
    WHERE m.is_active AND (m.name ILIKE pre OR m.generic_name ILIKE pre)
  ), name_any AS MATERIALIZED (
    SELECT m.id, m.name FROM drug_master m
    WHERE m.is_active AND (m.name ILIKE pat OR m.generic_name ILIKE pat)
  ), brand_pre AS MATERIALIZED (
    SELECT b.drug_master_id AS id, b.brand_name AS name FROM drug_brands b
    WHERE b.brand_name ILIKE pre AND b.drug_master_id IS NOT NULL
  ), brand_any AS MATERIALIZED (
    SELECT b.drug_master_id AS id, b.brand_name AS name FROM drug_brands b
    WHERE b.brand_name ILIKE pat AND b.drug_master_id IS NOT NULL
  )
  SELECT array_agg(id ORDER BY rank, name)
    INTO ids
  FROM (
    SELECT DISTINCT ON (id) id, rank, name FROM (
      (SELECT id, 1 AS rank, name FROM name_pre ORDER BY name LIMIT p_limit)
      UNION ALL
      (SELECT id, 2, name FROM brand_pre LIMIT 40)
      UNION ALL
      (SELECT id, 3, name FROM name_any ORDER BY name LIMIT p_limit * 2)
      UNION ALL
      (SELECT id, 4, name FROM brand_any LIMIT 40)
    ) c
    ORDER BY id, rank
  ) d;

  IF ids IS NULL THEN
    ids := ARRAY[]::uuid[];
  END IF;

  SELECT coalesce(jsonb_agg(row), '[]'::jsonb) INTO globals FROM (
    SELECT jsonb_build_object(
      'id', m.id, 'name', m.name, 'generic_name', m.generic_name,
      'form', m.form, 'strength', m.strength, 'unit', m.unit,
      'brands', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'brand_name', b.brand_name, 'manufacturer', b.manufacturer, 'hsn_code', b.hsn_code,
          'gst_rate', b.gst_rate, 'pack_size', b.pack_size, 'pack_unit', b.pack_unit))
        FROM (
          SELECT * FROM drug_brands bb WHERE bb.drug_master_id = m.id
          ORDER BY (bb.brand_name ILIKE pre) DESC, (bb.brand_name ILIKE pat) DESC, bb.brand_name
          LIMIT 6
        ) b), '[]'::jsonb)
    ) AS row
    FROM drug_master m
    JOIN unnest(ids) WITH ORDINALITY AS u(id, ord) ON u.id = m.id
    ORDER BY u.ord
  ) g;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'name', d.name, 'generic_name', d.generic_name, 'form', d.form,
      'strength', d.strength, 'unit', d.unit, 'reorder_level', d.reorder_level)), '[]'::jsonb)
    INTO tenant
  FROM (
    WITH t AS MATERIALIZED (
      SELECT * FROM drugs dd WHERE dd.is_active AND (dd.name ILIKE pat OR dd.generic_name ILIKE pat)
    )
    SELECT * FROM t ORDER BY t.name LIMIT p_limit
  ) d;

  RETURN jsonb_build_object('globals', globals, 'tenant', tenant);
END;
$$;

REVOKE ALL ON FUNCTION search_drugs_v1(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION search_drugs_v1(text, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
