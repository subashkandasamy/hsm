-- Tests a laboratory does not perform itself.
--
-- Almost every hospital laboratory in India sends some work out. A tertiary
-- centre's requisition form lists drug assays and PCR that it may run in
-- house, or may forward to Lal PathLabs, Metropolis or SRL — and reading the
-- form cannot tell you which. That ambiguity is not a problem to resolve
-- before building; it is the thing to build for.
--
-- So a test is either performed here or sent somewhere, and that is a property
-- of the hospital's own catalogue, not of the master. The same HbA1c is in
-- house at one hospital and referred at another.
--
-- ── Why this is not just a checkbox ────────────────────────────────────────
--
-- A referred test behaves differently all the way through. No analyzer will
-- ever report it, so it must not sit on a bench worklist looking overdue. It
-- takes days rather than hours. And when the result comes back, the report has
-- to say where it was done: a laboratory may not present another laboratory's
-- work as its own, and an assessor looking at an accredited report will expect
-- the referral laboratory named against the result.

CREATE TABLE IF NOT EXISTS lab_referral_labs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  -- Printed on the report beside the result, so a reader can see who did the
  -- work and whether they are accredited for it.
  nabl_number   text,
  contact_phone text,
  address       text,
  -- What the hospital pays them, as against what it charges the patient. Kept
  -- because a referred test is bought and resold, and a laboratory that cannot
  -- see the margin sets the price wrong.
  cost_price    numeric,
  -- Working days, for an honest promise at the counter.
  typical_tat_days int,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lab_referral_labs_name_key UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_lab_referral_labs_tenant
  ON lab_referral_labs (tenant_id) WHERE is_active;

ALTER TABLE lab_referral_labs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_referral_labs_tenant_all ON lab_referral_labs;
CREATE POLICY lab_referral_labs_tenant_all ON lab_referral_labs FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

-- Null means the hospital performs it. That is the common case, so it is the
-- one that needs no data.
ALTER TABLE lab_tests_catalog
  ADD COLUMN IF NOT EXISTS referral_lab_id uuid REFERENCES lab_referral_labs(id) ON DELETE SET NULL;

COMMENT ON COLUMN lab_tests_catalog.referral_lab_id IS
  'Set when this hospital sends the test out rather than performing it. Null means in house. Drives the report''s attribution and keeps the test off the analyzer worklist.';

CREATE INDEX IF NOT EXISTS idx_lab_tests_catalog_referred
  ON lab_tests_catalog (tenant_id) WHERE referral_lab_id IS NOT NULL;

-- ── The report has to say so ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_lab_report_analytes(uuid);

CREATE FUNCTION get_lab_report_analytes(p_order_id uuid)
RETURNS TABLE (
  department     text,
  test_id        uuid,
  test_name      text,
  test_code      text,
  sample_type    text,
  /** Null when the hospital performed it itself. */
  referred_to    text,
  referred_nabl  text,
  analyte_id     uuid,
  name           text,
  short_name     text,
  unit_ucum      text,
  decimals       int,
  value_type     text,
  display_order  int,
  value_num      numeric,
  value_text     text,
  ref_low        numeric,
  ref_high       numeric,
  flag           text
)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(c.department, 'Clinical Biochemistry'),
         c.id, c.name, c.code, c.sample_type,
         rl.name, rl.nabl_number,
         a.id, a.name, a.short_name,
         COALESCE(r.unit_ucum, a.unit_ucum), a.decimals, a.value_type,
         ta.display_order,
         r.value_num, r.value_text, r.ref_low, r.ref_high, r.flag
    FROM lab_result_analytes r
    JOIN lab_analytes a       ON a.id = r.analyte_id
    JOIN lab_tests_catalog c  ON c.id = r.test_id
    JOIN lab_test_analytes ta ON ta.analyte_id = a.id AND ta.lab_master_id = c.lab_master_id
    LEFT JOIN lab_referral_labs rl ON rl.id = c.referral_lab_id
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
  'Results for a printed report: the range that was applied when authorised (never re-resolved), grouped by the NABL discipline that performed each test, and naming the referral laboratory for anything sent out.';
