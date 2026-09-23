-- What the printed report shows.
--
-- Deliberately NOT get_order_analyte_form. That one resolves the range live,
-- which is right while a technician is typing. A report must show the range
-- that was ACTUALLY APPLIED when the result was authorised — the one
-- snapshotted onto the row — or a report reprinted after the laboratory revises
-- its ranges would quietly restate history.

CREATE OR REPLACE FUNCTION get_lab_report_analytes(p_order_id uuid)
RETURNS TABLE (
  test_id       uuid,
  test_name     text,
  test_code     text,
  sample_type   text,
  analyte_id    uuid,
  name          text,
  short_name    text,
  unit_ucum     text,
  decimals      int,
  value_type    text,
  display_order int,
  value_num     numeric,
  value_text    text,
  ref_low       numeric,
  ref_high      numeric,
  flag          text
)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.name, c.code, c.sample_type,
         a.id, a.name, a.short_name,
         COALESCE(r.unit_ucum, a.unit_ucum), a.decimals, a.value_type,
         ta.display_order,
         r.value_num, r.value_text, r.ref_low, r.ref_high, r.flag
    FROM lab_result_analytes r
    JOIN lab_analytes a       ON a.id = r.analyte_id
    JOIN lab_tests_catalog c  ON c.id = r.test_id
    JOIN lab_test_analytes ta ON ta.analyte_id = a.id AND ta.lab_master_id = c.lab_master_id
   WHERE r.lab_order_id = p_order_id
   ORDER BY c.name, ta.display_order
$$;
