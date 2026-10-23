-- Pin the search_path on the medico-legal triggers.
--
-- mlc_completeness_gate does not merely inspect its own NEW row: it reads
-- mlc_police_intimations to decide whether the police have been informed. A
-- function with a mutable search_path resolves that table name at call time,
-- so a session that puts a schema of its own in front of public could satisfy
-- a statutory gate with a table it wrote itself.
--
-- Unlikely through PostgREST, which does not hand out SET search_path. But the
-- whole point of putting these rules in the database was that they should not
-- depend on the caller behaving, and "the API probably won't let you" is the
-- argument this design exists to avoid making.
--
-- The lock and no-delete triggers get the same treatment for consistency, and
-- because auth.role() is itself a schema-qualified call they should not be
-- able to lose.
--
-- Form F's equivalents (0201/0202) have the same gap. They are left alone here
-- deliberately: changing a Form F gate deserves its own migration and its own
-- verification run, not a drive-by edit inside an unrelated one.

ALTER FUNCTION mlc_completeness_gate()    SET search_path TO 'public';
ALTER FUNCTION mlc_lock_completed()       SET search_path TO 'public';
ALTER FUNCTION mlc_no_delete()            SET search_path TO 'public';
ALTER FUNCTION mlc_intimation_immutable() SET search_path TO 'public';
