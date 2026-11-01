-- F-44 — a single test and a panel analyte answer the same clinical question
-- differently, and the single-test answer is the unsafe one.
--
-- WHAT IS ACTUALLY WRONG (measured, and worse than the finding says)
--
-- `enterResults` reads `crit_low / crit_high` from `lab_tests_catalog`.
-- `save_lab_analyte_results` resolves them through
-- `resolve_reference_range(analyte, tenant, sex, age_days)`.
--
-- The finding describes this as two sources of truth, with the single test
-- "judged against the catalogue's adult figure". There is no figure:
--
--   lab_tests_catalog rows                     : 22
--   ...with crit_low or crit_high set          :  0
--
-- So the single-test path cannot produce a critical flag at all. The code was
-- already fixed to read those columns — the comment at lab.ts even describes
-- the old behaviour as a bug — but the columns are empty for every test in
-- every tenant, so the fix is inert. Meanwhile the analyte ranges do carry
-- critical bounds:
--
--   FBG  / PPBG / RBSG : crit_low 55.0,  crit_high 450.0
--   HGB  (Haemoglobin) : crit_low 7.0, and sex-specific references
--                        (male 12.3-17.0, female 9.9-14.3)
--
-- Concretely, today: a fasting glucose of 500 entered as a single test is
-- flagged `high`, reaches no critical queue and telephones nobody; the same
-- number through a panel is `critical_high`. A haemoglobin of 6.0 in a woman is
-- judged against a flat unisex 11.5-17.5 and called `low` instead of
-- `critical_low`. Both are call-the-doctor-now numbers.
--
-- THE FIX
--
-- One resolver both paths can use. `lab_test_analytes` already links a
-- catalogue test to its analytes through `lab_master_id` (NOT `test_id` — the
-- mapping is on the master, which is why a join on the catalogue id finds
-- nothing). Where a test maps to exactly ONE analyte it is the same measurement
-- as that analyte, so the analyte's age/sex-aware range is the right answer.
--
-- Live shape, which is what makes this safe to do generically:
--
--   panels      CBC 28, URM 18, LFT 9, KFT 7, LIPID 4, TFT 3  -> analyte path
--   singles     CREA, FBG, HB, HBA1C, PPBG, RBS  (1 analyte)  -> this function
--   unmapped    ABO (qualitative), IGA           (0 analytes) -> catalogue
--
-- Checked before relying on it: `patients.gender` holds exactly
-- 'male'/'female'/NULL and `lab_reference_ranges.sex` holds 'male'/'female'/
-- 'any', so the existing match is sound, and `resolve_reference_range`
-- COALESCEs a NULL sex to 'any'.
--
-- SECURITY INVOKER, deliberately: it reads the order, the patient and the
-- ranges, and RLS should confine all three to the caller's own hospital. There
-- is nothing here that needs to see across tenants, so nothing here bypasses
-- the check that stops it.

BEGIN;

CREATE OR REPLACE FUNCTION public.effective_test_range(p_order_id uuid, p_test_id uuid)
RETURNS TABLE (
  ref_low      numeric,
  ref_high     numeric,
  crit_low     numeric,
  crit_high    numeric,
  range_source text
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant   uuid;
  v_patient  uuid;
  v_taken    timestamptz;
  v_sex      text;
  v_age_days int;
  v_analyte  uuid;
  v_count    int;
  cat        lab_tests_catalog;
  rng        lab_reference_ranges;
BEGIN
  SELECT o.tenant_id, o.patient_id, COALESCE(o.ordered_at, now())
    INTO v_tenant, v_patient, v_taken
    FROM lab_orders o
   WHERE o.id = p_order_id;
  IF v_tenant IS NULL THEN
    RETURN;                        -- no such order (or not visible); no range
  END IF;

  SELECT * INTO cat FROM lab_tests_catalog WHERE id = p_test_id;
  IF cat.id IS NULL THEN
    RETURN;
  END IF;

  -- The same basis save_lab_analyte_results uses, on purpose: age at the time
  -- the sample was taken, not age today. A result re-entered next year must not
  -- be re-judged against a range the patient has since aged out of.
  SELECT p.gender, GREATEST(0, (v_taken::date - p.dob))::int
    INTO v_sex, v_age_days
    FROM patients p
   WHERE p.id = v_patient;

  IF cat.lab_master_id IS NOT NULL THEN
    SELECT count(*) INTO v_count
      FROM lab_test_analytes la
     WHERE la.lab_master_id = cat.lab_master_id;

    -- Exactly one: the test IS that analyte. Two or more is a panel, whose
    -- results do not go through this path at all. Zero means the test has no
    -- analyte definition, so the catalogue is all there is.
    IF v_count = 1 THEN
      SELECT la.analyte_id INTO v_analyte
        FROM lab_test_analytes la
       WHERE la.lab_master_id = cat.lab_master_id;

      SELECT * INTO rng
        FROM resolve_reference_range(v_analyte, v_tenant, v_sex, v_age_days);
    END IF;
  END IF;

  IF rng.analyte_id IS NOT NULL THEN
    -- The analyte range wins WHOLESALE for the reference interval. Merging it
    -- field-by-field with the catalogue could pair a sex-specific lower bound
    -- with a unisex upper one and produce an interval belonging to nobody.
    --
    -- Critical bounds are the exception and COALESCE to the catalogue, because
    -- a missing critical bound is not a neutral default — it is the difference
    -- between a telephone call and silence. If either source names one, it is
    -- used.
    RETURN QUERY SELECT
      rng.ref_low,
      rng.ref_high,
      COALESCE(rng.crit_low,  cat.crit_low),
      COALESCE(rng.crit_high, cat.crit_high),
      'analyte'::text;
  ELSE
    RETURN QUERY SELECT
      cat.ref_low, cat.ref_high, cat.crit_low, cat.crit_high,
      'catalog'::text;
  END IF;
END;
$function$;

COMMIT;
