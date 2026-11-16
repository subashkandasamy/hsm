-- Old lab reports from a hospital's previous software ─────────────────────────
--
-- KMCH's SwiftEHR lab history (1,560 reports) goes into the real lab tables.
-- Three things it needs:
--
-- 1. The old request number (FAC-18-2000) is on the paper reports patients
--    hold. lab_orders.legacy_request_no keeps it, so the order can be found.
--    NULL for every order placed in Uyirly.
--
-- 2. SwiftEHR's analyser was 3-part (granulocytes / lymphocytes / MID cells)
--    and its urine report had bile salt and a heat-test albumin. Uyirly has no
--    line for these. They are added as measurements and joined to the CBC and
--    urine panels with created_at = retired_at, which the in-force rule of
--    0302 never counts as in force: such a line prints only on a report that
--    holds a value for it. No hospital's order form or new report changes.
--
-- 3. An imported report lists the lines it had. Uyirly's panels have lines
--    the old reports never carried (a 28-line CBC against SwiftEHR's 19), and
--    get_lab_report_analytes returns every line in force, empty ones flagged
--    pending — which made each old report print as "INTERIM" with blank lines.
--    For an imported order (legacy_request_no set) only lines with a value are
--    returned. Orders placed in Uyirly are untouched.

-- ── 1. The old request number ───────────────────────────────────────────────
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS legacy_request_no text;
COMMENT ON COLUMN lab_orders.legacy_request_no IS
  'The lab request number in the hospital''s previous software (e.g. FAC-18-2000). Set only on imported orders, whose report then lists only the lines that hold a value. NULL for orders placed in Uyirly.';
CREATE UNIQUE INDEX IF NOT EXISTS lab_orders_tenant_legacy_request_no_key
  ON lab_orders (tenant_id, legacy_request_no) WHERE legacy_request_no IS NOT NULL;

-- ── 2. Lines only old reports have ──────────────────────────────────────────
INSERT INTO lab_analytes (id, code, name, short_name, unit_ucum, decimals, is_active, value_type, allowed_values, normal_values)
VALUES
  (gen_random_uuid(), 'GRAN_PCT',    'Granulocytes',                  'Granulocytes',       '%',      1, true, 'numeric', NULL, NULL),
  (gen_random_uuid(), 'GRAN_ABS',    'Absolute Granulocyte Count',    'Granulocytes (abs)', '10*9/L', 2, true, 'numeric', NULL, NULL),
  (gen_random_uuid(), 'MID_ABS',     'Absolute MID Cell Count',       'MID cells (abs)',    '10*9/L', 2, true, 'numeric', NULL, NULL),
  (gen_random_uuid(), 'UR_BILESALT', 'Bile Salts',                    'Bile salt',          NULL,     0, true, 'ordinal', ARRAY['Negative', 'Positive'], ARRAY['Negative']),
  (gen_random_uuid(), 'UR_ALB',      'Albumin (heat coagulation test)', 'Albumin',          NULL,     0, true, 'ordinal', ARRAY['Nil', 'Trace', '1+', '2+', '3+', '4+'], ARRAY['Nil'])
ON CONFLICT (code) DO NOTHING;

-- Joined to the master panels, never in force (created_at = retired_at):
-- printed only where a result holds them. display_order sits each beside its
-- nearest Uyirly line.
INSERT INTO lab_test_analytes (id, lab_master_id, analyte_id, display_order, created_at, retired_at)
SELECT gen_random_uuid(), m.id, a.id, x.ord, '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z'
  FROM (VALUES ('CBC', 'GRAN_PCT', 9), ('CBC', 'GRAN_ABS', 14), ('CBC', 'MID_ABS', 16),
               ('URM', 'UR_ALB', 5), ('URM', 'UR_BILESALT', 9)) AS x(master, analyte, ord)
  JOIN lab_tests_master m ON m.code = x.master
  JOIN lab_analytes a     ON a.code = x.analyte
ON CONFLICT (lab_master_id, analyte_id) DO NOTHING;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM lab_test_analytes ta JOIN lab_analytes a ON a.id = ta.analyte_id
   WHERE a.code IN ('GRAN_PCT', 'GRAN_ABS', 'MID_ABS', 'UR_ALB', 'UR_BILESALT')
     AND ta.created_at = ta.retired_at;
  IF n <> 5 THEN
    RAISE EXCEPTION 'Expected 5 old-report-only panel lines, found %', n;
  END IF;
END $$;

-- ── 3. An imported report prints the lines it had ───────────────────────────
-- Same as 0302, plus the "imported" flag on o and the condition marked 0305.
CREATE OR REPLACE FUNCTION public.get_lab_report_analytes(p_order_id uuid)
 RETURNS TABLE(department text, test_id uuid, test_name text, test_code text, sample_type text,
               referred_to text, referred_nabl text, analyte_id uuid, name text, short_name text,
               unit_ucum text, decimals integer, value_type text, display_order integer,
               value_num numeric, value_text text, ref_low numeric, ref_high numeric,
               normal_text text, flag text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH o AS (
    SELECT lo.tenant_id, lo.patient_id, COALESCE(lo.ordered_at, now()) AS taken,
           lo.legacy_request_no IS NOT NULL AS imported
      FROM lab_orders lo WHERE lo.id = p_order_id
  ),
  pt AS (
    SELECT p.gender AS sex,
           GREATEST(0, ((SELECT taken FROM o)::date - p.dob))::int AS age_days
      FROM patients p WHERE p.id = (SELECT patient_id FROM o)
  )
  SELECT COALESCE(c.department, 'Clinical Biochemistry'),
         c.id, c.name, c.code, c.sample_type,
         rl.name, rl.nabl_number,
         a.id, a.name, a.short_name,
         COALESCE(r.unit_ucum, a.unit_ucum), a.decimals, a.value_type,
         ta.display_order,
         r.value_num, r.value_text,
         CASE WHEN r.analyte_id IS NULL THEN cur.ref_low  ELSE r.ref_low  END,
         CASE WHEN r.analyte_id IS NULL THEN cur.ref_high ELSE r.ref_high END,
         COALESCE(
           r.normal_text,
           CASE a.value_type
             WHEN 'ordinal' THEN array_to_string(a.normal_values, ' / ')
             WHEN 'text'    THEN cur.normal_text
           END),
         COALESCE(r.flag, 'pending')
    FROM lab_order_items i
    JOIN lab_tests_catalog c  ON c.id = i.test_id
    JOIN lab_test_analytes ta ON ta.lab_master_id = c.lab_master_id
    JOIN lab_analytes a       ON a.id = ta.analyte_id
    LEFT JOIN pt ON true
    LEFT JOIN LATERAL resolve_reference_range(a.id, i.tenant_id, pt.sex, pt.age_days) cur ON true
    LEFT JOIN lab_result_analytes r
           ON r.lab_order_id = i.lab_order_id
          AND r.test_id      = i.test_id
          AND r.analyte_id   = a.id
    LEFT JOIN lab_referral_labs rl ON rl.id = c.referral_lab_id
   WHERE i.lab_order_id = p_order_id
     -- 0302: the lines in force when the order was placed, or answered.
     AND ((ta.created_at <= (SELECT taken FROM o)
           AND (ta.retired_at IS NULL OR ta.retired_at > (SELECT taken FROM o)))
          OR r.analyte_id IS NOT NULL)
     AND (
       EXISTS (SELECT 1 FROM lab_result_analytes r2
                WHERE r2.lab_order_id = i.lab_order_id AND r2.test_id = i.test_id)
       OR (i.result_value IS NULL AND i.result_text IS NULL)
     )
     -- 0305: a report brought over from the previous software prints the lines
     -- it had, nothing pending (its other lines were never part of it).
     AND NOT ((SELECT imported FROM o)
              AND r.value_num IS NULL AND COALESCE(r.value_text, '') = '')
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

NOTIFY pgrst, 'reload schema';
