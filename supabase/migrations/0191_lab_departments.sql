-- Which bench does this test, as against what it is for.
--
-- Checked against a real requisition form from Kovai Medical Center, a NABH
-- hospital in Coimbatore. Their form is organised by department and numbered
-- by it — Biochemistry 41, Blood Bank 42, Clinical Pathology 44, Microbiology
-- 45, Molecular Biology 48. Every Indian laboratory form looks like this, and
-- it is not a stylistic choice: NABL grants accreditation per discipline, so
-- the registers, the internal quality control, the scope certificate on the
-- wall and the headings on the report all follow the same split.
--
-- Our categories are clinical — Liver, Kidney, Thyroid — which is right for a
-- doctor, who thinks "liver function" and never "Clinical Biochemistry". But
-- it is the wrong axis for the laboratory: KMCH's Biochemistry department
-- scatters across nine of our categories and their Serology across ten, so a
-- technician cannot get a bench worklist and a report cannot name the
-- discipline that produced it.
--
-- Both axes, therefore. `category` keeps its job on the ordering screen;
-- `department` is for the people running the samples. Neither replaces the
-- other, and nothing existing changes meaning.

ALTER TABLE lab_tests_master  ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE lab_tests_catalog ADD COLUMN IF NOT EXISTS department text;

COMMENT ON COLUMN lab_tests_master.department IS
  'The NABL discipline that performs this test. Drives bench worklists, report section headings and the accreditation register. Distinct from `category`, which is the clinical grouping a doctor orders by.';

-- The disciplines NABL accredits, which is also what a hospital already has
-- written on its own forms. Histopathology and Cytology are listed because a
-- laboratory has them; we do not serve them yet, and a value nobody can select
-- is better than pretending the discipline does not exist.
ALTER TABLE lab_tests_master DROP CONSTRAINT IF EXISTS lab_tests_master_department_check;
ALTER TABLE lab_tests_master ADD CONSTRAINT lab_tests_master_department_check
  CHECK (department IS NULL OR department = ANY (ARRAY[
    'Clinical Biochemistry',
    'Clinical Pathology',
    'Haematology',
    'Microbiology & Serology',
    'Immunohaematology (Blood Bank)',
    'Molecular Biology',
    'Histopathology & Cytology'
  ]));

ALTER TABLE lab_tests_catalog DROP CONSTRAINT IF EXISTS lab_tests_catalog_department_check;
ALTER TABLE lab_tests_catalog ADD CONSTRAINT lab_tests_catalog_department_check
  CHECK (department IS NULL OR department = ANY (ARRAY[
    'Clinical Biochemistry',
    'Clinical Pathology',
    'Haematology',
    'Microbiology & Serology',
    'Immunohaematology (Blood Bank)',
    'Molecular Biology',
    'Histopathology & Cytology'
  ]));

-- ── Every category placed, none left over ──────────────────────────────────
--
-- Two placements are worth defending, because they look arbitrary and are not.
--
-- Autoimmune and allergy work sits under Clinical Biochemistry rather than
-- Microbiology. It runs on the immunoassay analyser beside the hormones, not
-- at the culture bench — and KMCH's own form agrees, listing ANA and anti-TPO
-- under Biochemistry while dengue and HIV serology go under Microbiology.
--
-- Infectious serology goes to Microbiology for the same reason: it is the
-- department that owns organisms, whatever method detects them.

UPDATE lab_tests_master SET department = CASE category
  WHEN 'Biochemistry'              THEN 'Clinical Biochemistry'
  WHEN 'Liver'                     THEN 'Clinical Biochemistry'
  WHEN 'Kidney'                    THEN 'Clinical Biochemistry'
  WHEN 'Lipids'                    THEN 'Clinical Biochemistry'
  WHEN 'Blood Glucose & Diabetes'  THEN 'Clinical Biochemistry'
  WHEN 'Cardiac Markers'           THEN 'Clinical Biochemistry'
  WHEN 'Electrolytes & Minerals'   THEN 'Clinical Biochemistry'
  WHEN 'Vitamins & Nutrition'      THEN 'Clinical Biochemistry'
  WHEN 'Thyroid'                   THEN 'Clinical Biochemistry'
  WHEN 'Hormones & Endocrinology'  THEN 'Clinical Biochemistry'
  WHEN 'Tumour Markers'            THEN 'Clinical Biochemistry'
  WHEN 'Inflammatory Markers'      THEN 'Clinical Biochemistry'
  WHEN 'Autoimmune & Rheumatology' THEN 'Clinical Biochemistry'
  WHEN 'Allergy & Immunology'      THEN 'Clinical Biochemistry'
  WHEN 'Neonatal & Paediatric'     THEN 'Clinical Biochemistry'

  WHEN 'Urine Analysis'            THEN 'Clinical Pathology'
  WHEN 'Stool & GI Tests'          THEN 'Clinical Pathology'
  WHEN 'Body Fluid Analysis'       THEN 'Clinical Pathology'
  WHEN 'CSF Analysis'              THEN 'Clinical Pathology'
  WHEN 'Semen Analysis'            THEN 'Clinical Pathology'

  WHEN 'Haematology'               THEN 'Haematology'
  WHEN 'Coagulation Profile'       THEN 'Haematology'
  WHEN 'Thrombophilia'             THEN 'Haematology'

  WHEN 'Microbiology – Culture & Sensitivity' THEN 'Microbiology & Serology'
  WHEN 'Tuberculosis & AFB'        THEN 'Microbiology & Serology'
  WHEN 'Parasitology'              THEN 'Microbiology & Serology'
  WHEN 'Respiratory Pathogens'     THEN 'Microbiology & Serology'
  WHEN 'Virology & Serology'       THEN 'Microbiology & Serology'
  WHEN 'Hepatitis Panel'           THEN 'Microbiology & Serology'
  WHEN 'HIV & STI Panel'           THEN 'Microbiology & Serology'

  WHEN 'Genetics & Molecular'      THEN 'Molecular Biology'
  ELSE department
END
WHERE department IS NULL;

-- Anything a category mapping missed would otherwise be invisible on a bench
-- worklist. Biochemistry is where a general chemistry test belongs by default.
UPDATE lab_tests_master SET department = 'Clinical Biochemistry' WHERE department IS NULL;

-- Carry it onto whatever hospitals have already activated, and keep the two in
-- step for anything activated from master afterwards.
UPDATE lab_tests_catalog c SET department = m.department
  FROM lab_tests_master m
 WHERE c.lab_master_id = m.id AND c.department IS NULL;

UPDATE lab_tests_catalog SET department = 'Clinical Biochemistry' WHERE department IS NULL;

CREATE INDEX IF NOT EXISTS idx_lab_tests_master_department
  ON lab_tests_master (department, category);
CREATE INDEX IF NOT EXISTS idx_lab_tests_catalog_department
  ON lab_tests_catalog (tenant_id, department);
