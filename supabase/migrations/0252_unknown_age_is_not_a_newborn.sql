-- F-76 — an unknown date of birth is resolved as age 0, i.e. as a newborn.
--
-- `resolve_reference_range` selected on
--
--   COALESCE(p_age_days, 0) BETWEEN r.age_min_days AND r.age_max_days
--
-- and both result paths derive age as `(taken_at::date - p.dob)`. **7 of 30
-- patients have no dob**, so for those the expression is NULL and the resolver
-- is told the patient is a newborn. It then prefers the NARROWEST matching age
-- window, which is the worst possible tie-break for a guess.
--
-- Today this is harmless, and the reason is the whole risk: no reference range
-- currently has an upper age bound below 54,750 days (150 years), so an unknown
-- age falls through to a full-span range. The six age-specific ranges all start
-- at 6,570 days (18 years), which an unknown-age adult therefore FAILS to
-- match — losing the sex-specific haemoglobin interval and landing on a range
-- with no reference bounds at all.
--
-- It stops being harmless the first time a hospital enters a paediatric range,
-- which is ordinary practice. Demonstrated against live data with a
-- hypothetical neonate row (0-30 days, ref 14.0-22.0, crit 11.0/24.0), asking
-- what each rule picks for an adult woman with no recorded dob:
--
--   OLD (age coerced to 0)  -> the neonate range: ref 14.0..22.0, crit 11.0/24.0
--   NEW (age unknown)       -> the age-agnostic range: crit 7.0
--
-- Under the old rule her haemoglobin of 10.5 — low-normal for an adult woman —
-- is `critical_low` against a newborn's 11.0, telephoning a doctor about a
-- number that does not warrant it, while her true adult critical bound of 7.0
-- is displaced. False alarms in one direction and a reference interval
-- belonging to somebody else in the other.
--
-- THE FIX, AND WHY IT IS NOT "PASS NULL THROUGH"
--
-- The tempting change is to let a NULL age match every range. That is worse:
-- the existing `ORDER BY (age_max_days - age_min_days) ASC` prefers the
-- narrowest window, so NULL would match the neonate range AND rank it first —
-- arriving at the same wrong answer by a longer route.
--
-- So when the age is unknown this now does two things instead:
--
--   1. considers only ranges that make no age claim (`age_min_days = 0`), and
--   2. among those prefers the WIDEST window rather than the narrowest.
--
-- An unknown age therefore gets the most general statement about the analyte,
-- or nothing at all — never a band belonging to an age nobody recorded. Known
-- ages are untouched: the predicate and the ordering are byte-identical on that
-- branch.
--
-- Verified no-op on current data before applying: simulated OLD vs NEW for an
-- unknown age across every analyte that has ranges —
--
--   analytes checked 31 | selection changed 0 | gained 0 | lost 0
--
-- The table is schema-qualified so the body does not depend on search_path.
-- `SET search_path` is deliberately NOT added: it would block SQL-function
-- inlining, and qualification achieves the same safety here.

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_reference_range(
  p_analyte  uuid,
  p_tenant   uuid,
  p_sex      text,
  p_age_days integer
)
RETURNS lab_reference_ranges
LANGUAGE sql
STABLE
AS $function$
  SELECT r.*
    FROM public.lab_reference_ranges r
   WHERE r.analyte_id = p_analyte
     AND (r.tenant_id IS NULL OR r.tenant_id = p_tenant)
     AND (r.sex = 'any' OR r.sex = COALESCE(p_sex, 'any'))
     AND CASE
           WHEN p_age_days IS NULL
             -- Unknown age: only ranges that are not an age claim.
             THEN r.age_min_days = 0
             ELSE p_age_days BETWEEN r.age_min_days AND r.age_max_days
         END
   ORDER BY (r.tenant_id IS NOT NULL) DESC,
            (r.sex <> 'any') DESC,
            -- Known age: the narrowest matching window is the most specific
            -- and therefore the best. Unknown age: the widest is the most
            -- general and therefore the only honest one. Same expression,
            -- negated, so the two branches cannot drift apart.
            CASE
              WHEN p_age_days IS NULL THEN -(r.age_max_days - r.age_min_days)
              ELSE                          (r.age_max_days - r.age_min_days)
            END ASC,
            (r.ref_low IS NOT NULL OR r.ref_high IS NOT NULL) DESC,
            r.created_at DESC
   LIMIT 1
$function$;

COMMIT;
