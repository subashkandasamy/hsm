-- F-72 (new, found by the F-26 consistency scan rather than by reading).
--
-- `ward_room_types.tenant_id` is **text**. It is the only one of 256 public
-- tables whose tenant_id is not `uuid`, and the consequence is not cosmetic:
--
--   FK on ward_room_types -> (NO foreign keys)
--
-- Every other tenant-scoped table carries `fk_<table>_tenant REFERENCES
-- tenants(id)`. This one cannot, because text and uuid have no equality
-- operator, so Postgres would refuse the constraint. A row here can therefore
-- hold any string at all as its tenant — a deleted hospital's id, a typo, an
-- empty string — and nothing in the database objects.
--
-- RLS is NOT affected and was checked: all four policies cast explicitly,
-- `tenant_id = ((SELECT current_tenant_id()))::text`, so isolation works
-- correctly today. This is a data-integrity defect, not a security one.
--
-- It also makes the table invisible to tenant-consistency tooling: the scan
-- written for F-26 compares `child.tenant_id IS DISTINCT FROM parent.tenant_id`
-- and that comparison **fails to parse** for this table, which is how the
-- defect surfaced. One table of 291 relationships silently uncheckable.
--
-- Verified before converting: all 12 rows hold well-formed uuid strings and
-- every one resolves to a live tenant (aes-health 1, demo 5, karur 4,
-- newtest 2), so the cast cannot fail and no row is orphaned by the new FK.
--
-- THE TRAP: the four policies must be rewritten in this same migration. They
-- currently cast current_tenant_id() to text; once the column is uuid that cast
-- produces `uuid = text` and every policy raises. Converting the column without
-- touching the policies would lock every user out of the room-type screens.
-- The policy bodies are otherwise copied exactly, including the admin-only
-- write rule and the EXISTS against profiles.

BEGIN;

DROP POLICY IF EXISTS tenant_ward_room_types_select ON public.ward_room_types;
DROP POLICY IF EXISTS tenant_ward_room_types_insert ON public.ward_room_types;
DROP POLICY IF EXISTS tenant_ward_room_types_update ON public.ward_room_types;
DROP POLICY IF EXISTS tenant_ward_room_types_delete ON public.ward_room_types;

-- The two indexes on this column (ward_room_types_tenant_id_name_key and
-- idx_ward_room_types_tenant) are rebuilt automatically by the type change.
ALTER TABLE public.ward_room_types
  ALTER COLUMN tenant_id TYPE uuid USING tenant_id::uuid;

ALTER TABLE public.ward_room_types
  ALTER COLUMN tenant_id SET NOT NULL;

-- Now possible, and matching every other tenant-scoped table.
ALTER TABLE public.ward_room_types
  ADD CONSTRAINT fk_ward_room_types_tenant
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Same rules as before, minus the ::text cast the column no longer needs.
CREATE POLICY tenant_ward_room_types_select ON public.ward_room_types
  FOR SELECT
  USING (
    tenant_id = (SELECT current_tenant_id())
    AND (SELECT auth.role()) = 'authenticated'
  );

CREATE POLICY tenant_ward_room_types_insert ON public.ward_room_types
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM profiles
       WHERE profiles.id = (SELECT auth.uid())
         AND profiles.role = 'admin'
         AND profiles.tenant_id = (SELECT current_tenant_id())
    )
  );

CREATE POLICY tenant_ward_room_types_update ON public.ward_room_types
  FOR UPDATE
  USING (
    tenant_id = (SELECT current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM profiles
       WHERE profiles.id = (SELECT auth.uid())
         AND profiles.role = 'admin'
         AND profiles.tenant_id = (SELECT current_tenant_id())
    )
  );

CREATE POLICY tenant_ward_room_types_delete ON public.ward_room_types
  FOR DELETE
  USING (
    tenant_id = (SELECT current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM profiles
       WHERE profiles.id = (SELECT auth.uid())
         AND profiles.role = 'admin'
         AND profiles.tenant_id = (SELECT current_tenant_id())
    )
  );

COMMIT;
