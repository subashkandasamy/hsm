-- F-02. The three write policies on the tenant-logos bucket were named for an
-- intent they never implemented: they checked only `bucket_id`, and they were
-- granted to {public}, which includes anon. Any unauthenticated caller could
-- overwrite or delete ANY hospital's logo — the mark printed on every bill,
-- prescription and report that hospital issues — or upload arbitrary images
-- into a public bucket on Uyirly infrastructure.
--
-- Blast radius of this change is zero: tenantProfile.ts:146 uploads through the
-- SERVICE client, which bypasses RLS entirely, and it is the only code in the
-- repo that touches this bucket. No application path relies on these policies.
--
-- Paths are `{tenant_id}/logo.{ext}` (tenantProfile.ts:143), so the first path
-- segment is the owning tenant. settings:write is admin-only in rbac.ts, so the
-- policy name's "admin" is now true.
--
-- Public read is deliberately kept: the bucket is public and logos are fetched
-- unauthenticated when a bill renders.

DROP POLICY IF EXISTS tenant_logo_admin_write  ON storage.objects;
DROP POLICY IF EXISTS tenant_logo_admin_update ON storage.objects;
DROP POLICY IF EXISTS tenant_logo_admin_delete ON storage.objects;

CREATE POLICY tenant_logo_admin_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-logos'
    AND (storage.foldername(name))[1] = (select current_tenant_id())::text
    AND (select is_tenant_admin())
  );

CREATE POLICY tenant_logo_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-logos'
    AND (storage.foldername(name))[1] = (select current_tenant_id())::text
    AND (select is_tenant_admin())
  )
  -- Spelled out rather than left to Postgres's reuse of USING, so a logo cannot
  -- be renamed out of its own tenant's folder.
  WITH CHECK (
    bucket_id = 'tenant-logos'
    AND (storage.foldername(name))[1] = (select current_tenant_id())::text
    AND (select is_tenant_admin())
  );

CREATE POLICY tenant_logo_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-logos'
    AND (storage.foldername(name))[1] = (select current_tenant_id())::text
    AND (select is_tenant_admin())
  );
