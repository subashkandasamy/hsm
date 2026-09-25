-- The report names the discipline that produced each result.
--
-- Every Indian laboratory report is printed under department headings —
-- DEPARTMENT OF CLINICAL BIOCHEMISTRY, then the chemistry; DEPARTMENT OF
-- HAEMATOLOGY, then the counts. That is not decoration. NABL accredits per
-- discipline, so a report has to make plain which accredited discipline stands
-- behind each number, and a laboratory whose scope covers biochemistry but not
-- microbiology must not print both under one anonymous heading.
--
-- Ordering changes with it: department first, then test, then the analyte's
-- own display order. A CBC's twenty measurements stay in the order a
-- haematologist reads them, but they now sit under the right heading.

DROP FUNCTION IF EXISTS get_lab_report_analytes(uuid);

CREATE FUNCTION get_lab_report_analytes(p_order_id uuid)
RETURNS TABLE (
  department    text,
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
  SELECT COALESCE(c.department, 'Clinical Biochemistry'),
         c.id, c.name, c.code, c.sample_type,
         a.id, a.name, a.short_name,
         COALESCE(r.unit_ucum, a.unit_ucum), a.decimals, a.value_type,
         ta.display_order,
         r.value_num, r.value_text, r.ref_low, r.ref_high, r.flag
    FROM lab_result_analytes r
    JOIN lab_analytes a       ON a.id = r.analyte_id
    JOIN lab_tests_catalog c  ON c.id = r.test_id
    JOIN lab_test_analytes ta ON ta.analyte_id = a.id AND ta.lab_master_id = c.lab_master_id
   WHERE r.lab_order_id = p_order_id
   -- Haematology before biochemistry is the conventional order on an Indian
   -- report, and a fixed order matters more than which one: a report that
   -- shuffles its sections between prints is hard to compare against the last.
   ORDER BY CASE COALESCE(c.department, 'Clinical Biochemistry')
              WHEN 'Haematology'                    THEN 1
              WHEN 'Clinical Biochemistry'          THEN 2
              WHEN 'Clinical Pathology'             THEN 3
              WHEN 'Microbiology & Serology'        THEN 4
              WHEN 'Immunohaematology (Blood Bank)' THEN 5
              WHEN 'Molecular Biology'              THEN 6
              ELSE 7
            END,
            c.name, ta.display_order
$$;

COMMENT ON FUNCTION get_lab_report_analytes(uuid) IS
  'Results for a printed report, with the range that was applied when authorised (never re-resolved), grouped by the NABL discipline that performed each test.';
