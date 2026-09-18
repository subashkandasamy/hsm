-- One database call for a drug search ────────────────────────────────────────
-- The search used to make seven round trips per keystroke (master prefix, master
-- contains, brand prefix, brand contains, the hospital's own drugs, then the
-- molecules and brands for the matches). Over a network each trip costs more than
-- the query itself. This does all of it in one statement and returns JSON.
-- SECURITY INVOKER: row security still applies, so a hospital sees only its own
-- `drugs` rows while the shared master and brands stay readable.
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
  SELECT array_agg(id ORDER BY rank, name)
    INTO ids
  FROM (
    SELECT DISTINCT ON (id) id, rank, name FROM (
      (SELECT m.id, 1 AS rank, m.name FROM drug_master m
        WHERE m.is_active AND (m.name ILIKE pre OR m.generic_name ILIKE pre)
        ORDER BY m.name LIMIT p_limit)
      UNION ALL
      (SELECT b.drug_master_id, 2, b.brand_name FROM drug_brands b
        WHERE b.brand_name ILIKE pre AND b.drug_master_id IS NOT NULL LIMIT 40)
      UNION ALL
      (SELECT m.id, 3, m.name FROM drug_master m
        WHERE m.is_active AND (m.name ILIKE pat OR m.generic_name ILIKE pat)
        ORDER BY m.name LIMIT p_limit * 2)
      UNION ALL
      (SELECT b.drug_master_id, 4, b.brand_name FROM drug_brands b
        WHERE b.brand_name ILIKE pat AND b.drug_master_id IS NOT NULL LIMIT 40)
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
    SELECT * FROM drugs dd
    WHERE dd.is_active AND (dd.name ILIKE pat OR dd.generic_name ILIKE pat)
    ORDER BY dd.name LIMIT p_limit
  ) d;

  RETURN jsonb_build_object('globals', globals, 'tenant', tenant);
END;
$$;

REVOKE ALL ON FUNCTION search_drugs_v1(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION search_drugs_v1(text, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
