-- Row-security speed: call auth / tenant helpers once per query, not per row ──
--
-- Policies written as `tenant_id = current_tenant_id() AND auth.role() = 'authenticated'`
-- re-run those functions for every row the query touches. Wrapping each call in a
-- scalar sub-select makes Postgres evaluate it once (an InitPlan) and reuse the value.
-- Measured on drug_brands (242k rows): a brand search went from 1,686 ms to 403 ms,
-- and the drug search as a whole from ~2.4 s to ~0.5 s. Semantics are unchanged.
DO $$
DECLARE
  p        record;
  new_qual text;
  new_chk  text;
  fn       text;
  changed  int := 0;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual ~ '(auth\.role|auth\.uid|current_tenant_id|is_platform_admin)\(\)'
        OR with_check ~ '(auth\.role|auth\.uid|current_tenant_id|is_platform_admin)\(\)')
  LOOP
    new_qual := p.qual;
    new_chk  := p.with_check;

    -- Unwrap anything already wrapped, so re-running this migration is safe.
    new_qual := regexp_replace(new_qual, '\(\s*SELECT\s+(auth\.role|auth\.uid|current_tenant_id|is_platform_admin)\(\)\s*(AS\s+\w+\s*)?\)', '\1()', 'gi');
    new_chk  := regexp_replace(new_chk,  '\(\s*SELECT\s+(auth\.role|auth\.uid|current_tenant_id|is_platform_admin)\(\)\s*(AS\s+\w+\s*)?\)', '\1()', 'gi');

    FOREACH fn IN ARRAY ARRAY['auth.role()', 'auth.uid()', 'current_tenant_id()', 'is_platform_admin()'] LOOP
      new_qual := replace(new_qual, fn, '(select ' || fn || ')');
      new_chk  := replace(new_chk,  fn, '(select ' || fn || ')');
    END LOOP;

    IF new_qual IS NOT NULL AND new_chk IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, new_qual, new_chk);
    ELSIF new_qual IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', p.policyname, p.schemaname, p.tablename, new_qual);
    ELSIF new_chk IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, new_chk);
    END IF;
    changed := changed + 1;
  END LOOP;
  RAISE NOTICE 'RLS policies rewritten: %', changed;
END $$;

NOTIFY pgrst, 'reload schema';
