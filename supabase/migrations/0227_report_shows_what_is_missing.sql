-- A report has to show what the panel promised, not only what arrived.
--
-- This function was driven from lab_result_analytes — the rows that exist. An
-- analyte never written has no row, so it did not print, and a Complete Blood
-- Count that came back with fourteen of its twenty-eight numbers printed as a
-- shorter table with nothing to say it was short. Two orders in the demo
-- tenant were released exactly that way.
--
-- Driving it from lab_test_analytes instead — what the panel is defined to
-- measure — means every promised analyte appears, with its value or without
-- one. A reader sees the gap, and so can the report's own "interim" marker,
-- which until now counted only single tests and was blind to a missing
-- analyte by construction.
--
-- ISO 15189:2022 §7.4.1.7 asks for a result released before it is complete to
-- be flagged as preliminary. Printing an incomplete panel as though it were
-- final is the opposite of that.

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
         -- No row means nobody has measured it yet. 'pending' is the same word
         -- the rest of the product uses for that, and it is what the report
         -- counts to decide whether it is interim.
         COALESCE(r.flag, 'pending')
    -- Driven from the order's own tests and the analytes each one is defined
    -- to measure. The results are joined on; their absence is the point.
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
$function$;

COMMENT ON FUNCTION get_lab_report_analytes(uuid) IS
  'Every analyte the order''s panels are defined to measure, with its result where one exists and flag ''pending'' where none does. Driven from the order rather than from the results, so an unmeasured analyte is visible instead of absent.';
