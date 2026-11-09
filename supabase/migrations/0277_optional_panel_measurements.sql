-- 0277 — A hospital can mark measurements in a panel as optional.
--
-- Found at Karur, 9 Nov 2026: the Erba H360 is a 3-part haematology analyzer
-- (lymphocytes, mid cells, granulocytes). Uyirly's CBC is a 5-part panel, so
-- Eosinophils, Basophils, AEC and ABC — which that machine cannot measure —
-- were always "pending". Every CBC from it could only be released as an
-- interim report, promising a final one that would never come.
--
-- The user chose (option 2) to keep the 5-part CBC and let each hospital mark
-- measurements optional: blank optional measurements are left off the report
-- and do not count as missing, so the CBC verifies as complete and prints as
-- final. A value entered for one (from a smear) prints as usual.
--
-- Per hospital and per catalogue test, so a hospital with a 5-part analyzer
-- is unaffected.

CREATE TABLE IF NOT EXISTS lab_optional_analytes (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  test_id     uuid NOT NULL REFERENCES lab_tests_catalog(id) ON DELETE CASCADE,
  analyte_id  uuid NOT NULL REFERENCES lab_analytes(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, test_id, analyte_id)
);

-- Read by the report function, which runs as the signed-in user, so staff of
-- the hospital may read their own rows. Writes go through the server action
-- (setMeasurementOptional), which checks lab:manage first.
ALTER TABLE lab_optional_analytes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lab_optional_analytes FROM anon, authenticated;
GRANT SELECT ON lab_optional_analytes TO authenticated;
DROP POLICY IF EXISTS lab_optional_analytes_read ON lab_optional_analytes;
CREATE POLICY lab_optional_analytes_read ON lab_optional_analytes FOR SELECT
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

-- The report's list of measurements, unchanged except for one rule: a blank
-- measurement the hospital marked optional is left out. Everything that asks
-- "what is still missing?" — the printed report, the patient portal, the
-- interim banner and the verify check (countMissingAnalytes) — reads this
-- function, so they all agree.
CREATE OR REPLACE FUNCTION public.get_lab_report_analytes(p_order_id uuid)
 RETURNS TABLE(department text, test_id uuid, test_name text, test_code text, sample_type text, referred_to text, referred_nabl text, analyte_id uuid, name text, short_name text, unit_ucum text, decimals integer, value_type text, display_order integer, value_num numeric, value_text text, ref_low numeric, ref_high numeric, flag text)
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
     -- 0277: a blank measurement this hospital marked optional is not promised.
     AND NOT (
       r.value_num IS NULL AND COALESCE(r.value_text, '') = ''
       AND EXISTS (SELECT 1 FROM lab_optional_analytes o
                    WHERE o.tenant_id = i.tenant_id
                      AND o.test_id = i.test_id
                      AND o.analyte_id = a.id)
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
