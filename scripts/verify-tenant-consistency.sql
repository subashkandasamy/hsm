-- verify:tenant-consistency — does any child row point at a parent in a
-- different hospital?
--
-- F-26: 294 foreign keys have a tenant-scoped table on both sides and only 3
-- are composite keys including tenant_id, so in the other 291 the database will
-- happily accept a child in tenant A referencing a parent in tenant B.
--
-- Adding 291 composite foreign keys would mean a UNIQUE (tenant_id, id) on
-- every parent and 291 constraint rebuilds, each taking an ACCESS EXCLUSIVE
-- lock on a live hospital's tables. This is the cheaper half of the value: the
-- finding's own framing of the risk is "unexplainable mixed data long after the
-- write that caused it, with no constraint to catch it at the time" — so catch
-- it at the time. Run it after any bulk or headless write, and on a schedule.
--
-- Read-only. Raises (and so rolls back) either way, so it cannot alter
-- anything even by accident.
DO $$
DECLARE
  r record;
  n bigint;
  total bigint := 0;
  checked int := 0;
  uncheckable text := '';
  findings text := '';
BEGIN
  FOR r IN
    WITH tenant_tables AS (
      SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'tenant_id'),
    partitions AS (SELECT c.oid FROM pg_class c JOIN pg_inherits i ON i.inhrelid = c.oid)
    SELECT c.conname,
           c.conrelid::regclass::text  AS child,
           c.confrelid::regclass::text AS parent,
           ca.attname AS child_col,
           pa.attname AS parent_col
      FROM pg_constraint c
      JOIN pg_attribute ca ON ca.attrelid = c.conrelid  AND ca.attnum = c.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
     WHERE c.contype = 'f'
       AND c.connamespace = 'public'::regnamespace
       -- partitions inherit their parent's constraints; checking the parent
       -- table covers every partition's rows once
       AND c.conrelid NOT IN (SELECT oid FROM partitions)
       AND array_length(c.conkey, 1) = 1        -- composite FKs already enforce it
       AND c.conrelid::regclass::text  IN (SELECT table_name FROM tenant_tables)
       AND c.confrelid::regclass::text IN (SELECT table_name FROM tenant_tables)
     ORDER BY 2, 1
  LOOP
    BEGIN
      -- Both sides cast to text: tenant_id is uuid everywhere except
      -- ward_room_types (F-72), and a type mismatch must not blind the scan.
      EXECUTE format(
        'SELECT count(*) FROM %I ch JOIN %I pa ON pa.%I::text = ch.%I::text
          WHERE ch.tenant_id::text IS DISTINCT FROM pa.tenant_id::text',
        r.child, r.parent, r.parent_col, r.child_col) INTO n;
      checked := checked + 1;
      IF n > 0 THEN
        total := total + n;
        findings := findings || format(E'\n  %s rows: %s.%s -> %s.%s  (%s)',
          n, r.child, r.child_col, r.parent, r.parent_col, r.conname);
      END IF;
    EXCEPTION WHEN others THEN
      uncheckable := uncheckable || format(E'\n  %s: %s', r.conname, SQLERRM);
    END;
  END LOOP;

  RAISE EXCEPTION E'TENANT CONSISTENCY\n  relationships checked : %\n  mismatched rows       : %\n%\n%',
    checked,
    total,
    COALESCE(NULLIF(findings, ''), '  (no child row points at a parent in another hospital)'),
    CASE WHEN uncheckable = '' THEN '  (nothing uncheckable)'
         ELSE E'  UNCHECKABLE (fix these — a blind spot is worse than a finding):' || uncheckable END;
END $$;
