-- The phrases this hospital writes every day, kept so nobody types them twice.
--
-- A doctor seeing forty patients writes "S1 S2 heard, no murmur" forty times.
-- They can hold the mic instead, but then they spend the time correcting what
-- the mic heard. The cheapest fix is neither: offer the phrase they were about
-- to write and let one tap put it in.
--
-- Three decisions are baked into this shape, and each one is load-bearing.
--
-- `field_key` scopes a phrase to one box. A CVS finding must never be on offer
-- under chief complaint — a picker that shows every phrase everywhere is worse
-- than no picker, because the doctor has to read past the wrong ones. The keys
-- are the ones already in the components: exam.cvs, hx.drug_history and so on.
--
-- `use_count` is how the library improves on its own. The picker sorts by it,
-- so after a fortnight the phrases a hospital actually uses are the top rows,
-- with nobody curating anything. That is the whole of "it learns" — counting,
-- not cleverness.
--
-- And the rows belong to the tenant, not the doctor. A small clinic has two or
-- three doctors and the hard problem is filling the library at all, not keeping
-- one doctor's wording away from another's. `created_by` is recorded anyway, so
-- the day someone wants per-doctor phrases it is a WHERE clause, not a migration.
--
-- Deliberately absent: any notion of a whole-note template. One tap must never
-- be able to assert findings the doctor did not examine for.

CREATE TABLE IF NOT EXISTS note_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Which box this belongs to, e.g. 'exam.cvs'. Loose text on purpose: a new
  -- note field should not need a migration before it can have phrases.
  field_key    text NOT NULL,
  -- What the doctor reads in the list, e.g. "Normal CVS".
  label        text NOT NULL,
  -- What gets inserted, e.g. "S1 S2 heard, no murmur".
  body         text NOT NULL,

  -- NULL means every department. Otherwise a departments.clinical_template
  -- value, so an obstetric phrase stays out of the dental room.
  department   text CHECK (department IS NULL OR department = ANY (
                 ARRAY['general', 'dental', 'ophthalmology', 'paediatrics', 'obgyn'])),

  created_by   uuid REFERENCES profiles(id),
  use_count    integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT note_templates_label_not_blank CHECK (btrim(label) <> ''),
  CONSTRAINT note_templates_body_not_blank  CHECK (btrim(body)  <> '')
);

-- How the picker reads: one field, best-used first. The index carries the sort
-- so opening a note box is one index scan and not a sort over the hospital's
-- whole library.
CREATE INDEX IF NOT EXISTS note_templates_pick_idx
  ON note_templates (tenant_id, field_key, use_count DESC, label);

-- The same phrase must not be saveable twice under the same name in the same
-- box. Case-folded, because "Normal CVS" and "Normal cvs" are one phrase to
-- everyone except a database.
CREATE UNIQUE INDEX IF NOT EXISTS note_templates_label_key
  ON note_templates (tenant_id, field_key, lower(btrim(label)));

ALTER TABLE note_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS note_templates_tenant_all ON note_templates;
CREATE POLICY note_templates_tenant_all ON note_templates FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated')
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT auth.role()) = 'authenticated');

-- Counting a use is a read-then-write, and the doctor is mid-consultation. A
-- function keeps it to one round trip and makes the increment atomic, so two
-- doctors tapping the same phrase at once do not each read 7 and write 8.
CREATE OR REPLACE FUNCTION bump_note_template_use(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'bump_note_template_use: tenant_id could not be resolved';
  END IF;
  -- SECURITY DEFINER bypasses RLS, so the tenant check has to be written out:
  -- without it this would count a use against another hospital's row.
  UPDATE note_templates
     SET use_count = use_count + 1, last_used_at = now()
   WHERE id = p_id AND tenant_id = v_tenant;
END $$;

REVOKE ALL ON FUNCTION bump_note_template_use(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION bump_note_template_use(uuid) TO authenticated;

COMMENT ON TABLE note_templates IS
  'Reusable phrases per note field, per hospital. Scoped by field_key so a CVS phrase is never offered under chief complaint; ordered by use_count so the library sorts itself by what the hospital actually writes.';
