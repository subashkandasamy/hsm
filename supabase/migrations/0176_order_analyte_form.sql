-- Everything the result-entry screen needs, in one query.
--
-- For each test on an order that has analytes behind it: the analyte, the
-- reference range resolved for THIS patient's sex and age, and whatever has
-- already been entered. Tests with no analytes return no rows and keep using
-- the single-value field they use today, so a hospital's own "Thyroid Profile"
-- goes on working untouched.
--
-- The range shown while typing has to be the same range the save will apply,
-- or the preview lies. Both go through resolve_reference_range.

CREATE OR REPLACE FUNCTION get_order_analyte_form(p_order_id uuid)
RETURNS TABLE (
  test_id       uuid,
  test_name     text,
  analyte_id    uuid,
  code          text,
  name          text,
  short_name    text,
  unit_ucum     text,
  decimals      int,
  display_order int,
  ref_low       numeric,
  ref_high      numeric,
  crit_low      numeric,
  crit_high     numeric,
  value_num     numeric,
  value_text    text,
  flag          text
)
LANGUAGE sql STABLE AS $$
  WITH o AS (
    SELECT lo.id, lo.tenant_id, lo.patient_id,
           COALESCE(lo.ordered_at, now()) AS taken
      FROM lab_orders lo WHERE lo.id = p_order_id
  ),
  pt AS (
    SELECT p.gender AS sex,
           GREATEST(0, ((SELECT taken FROM o)::date - p.dob))::int AS age_days
      FROM patients p WHERE p.id = (SELECT patient_id FROM o)
  )
  SELECT
    c.id, c.name,
    a.id, a.code, a.name, a.short_name, a.unit_ucum, a.decimals, ta.display_order,
    r.ref_low, r.ref_high, r.crit_low, r.crit_high,
    res.value_num, res.value_text, COALESCE(res.flag, 'pending')
  FROM lab_order_items loi
  JOIN lab_tests_catalog c   ON c.id = loi.test_id
  JOIN lab_test_analytes ta  ON ta.lab_master_id = c.lab_master_id
  JOIN lab_analytes a        ON a.id = ta.analyte_id AND a.is_active
  CROSS JOIN pt
  LEFT JOIN LATERAL resolve_reference_range(
      a.id, (SELECT tenant_id FROM o), pt.sex, pt.age_days) r ON true
  LEFT JOIN lab_result_analytes res
      ON res.lab_order_id = p_order_id
     AND res.test_id = c.id
     AND res.analyte_id = a.id
  WHERE loi.lab_order_id = p_order_id
  ORDER BY c.name, ta.display_order
$$;
