-- 0227 went one step too far, and the step was backwards.
--
-- Driving the report from lab_test_analytes made every promised analyte
-- appear, which is what an incomplete Complete Blood Count needed. But some
-- catalogue entries carry a master with a single analyte behind it and are
-- nonetheless answered on lab_order_items — a Haemoglobin typed in as one
-- number, an HbA1c of 8.2. Those have no analyte row at all.
--
-- After 0227 they came back as a pending analyte row. The report builder then
-- treats any test with analyte rows as panel-reported and drops it from the
-- singles list — so the 8.2 disappeared and a blank line took its place. A
-- report that prints nothing where a result exists is worse than the one that
-- printed a short table, which is what this was meant to fix.
--
-- So the placeholder is offered only where it means something: a test that has
-- begun reporting as a panel, or one that has no answer anywhere yet. A test
-- answered on its item is left alone, and prints as it always did.

CREATE OR REPLACE FUNCTION public.get_lab_report_analytes(p_order_id uuid)
 RETURNS TABLE(department text, test_id uuid, test_name text, test_code text,
               sample_type text, referred_to text, referred_nabl text,
               analyte_id uuid, name text, short_name text, unit_ucum text,
               decimals integer, value_type text, display_order integer,
               value_num numeric, value_text text, ref_low numeric,
               ref_high numeric, flag text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(c.department, 'Clinical Biochemistry'),
         c.id, c.name, c.code, c.sample_type,
         rl.name, rl.nabl_number,
         a.id, a.name, a.short_name,
         COALESCE(r.unit_ucum, a.unit_ucum), a.decimals, a.value_type,
         ta.display_order,
         r.value_num, r.value_text, r.ref_low, r.ref_high,
         COALESCE(r.flag, 'pending')
    FROM lab_order_items i
    JOIN lab_tests_catalog c  ON c.id = i.test_id
    JOIN lab_test_analytes ta ON ta.lab_master_id = c.lab_master_id
    JOIN lab_analytes a       ON a.id = ta.analyte_id
    LEFT JOIN lab_result_analytes r
           ON r.lab_order_id = i.lab_order_id
          AND r.test_id      = i.test_id
          AND r.analyte_id   = a.id
    LEFT JOIN lab_referral_labs rl ON rl.id = c.referral_lab_id
   WHERE i.lab_order_id = p_order_id
     AND (
       -- Reporting as a panel: show every analyte it promised, measured or not.
       EXISTS (SELECT 1 FROM lab_result_analytes r2
                WHERE r2.lab_order_id = i.lab_order_id AND r2.test_id = i.test_id)
       -- Or nothing anywhere yet, in which case the promised list is still the
       -- honest thing to show.
       OR (i.result_value IS NULL AND i.result_text IS NULL)
     )
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
$function$;

COMMENT ON FUNCTION get_lab_report_analytes(uuid) IS
  'Every analyte an order''s panels are defined to measure, with its result where one exists and flag ''pending'' where none does — so an unmeasured analyte is visible rather than absent. A test answered on lab_order_items is excluded, and prints through the single-test path instead.';
