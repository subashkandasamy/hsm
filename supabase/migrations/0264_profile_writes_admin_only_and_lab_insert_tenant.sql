-- Two RLS holes found by the table-level audit (2026-11-08), both closed here.
--
-- ── 1. Any member of staff could rewrite the hospital's billing identity ────
--
-- tenant_profile_upsert (0041) was FOR ALL, gated only on "this row is my
-- hospital's". No role check, no active check — INSERT, UPDATE and DELETE for
-- every logged-in member of staff. That row holds the hospital's name, GSTIN
-- and logo, and since 0262 the GST registration itself: gst_enabled and
-- gst_composition decide whether a bill is a TAX INVOICE that collects tax or
-- a BILL OF SUPPLY that may not. A lab technician, with their own login and
-- the public anon key, could switch a composition dealer to charging GST.
--
-- The application already allows this to admins only: settings:write belongs
-- to the admin role alone, and both writers (upsertTenantProfile and
-- uploadTenantLogo in actions/tenantProfile.ts) require it and run on the
-- caller's own session, so RLS is what stands behind them. This makes the
-- database say the same thing.
--
-- current_active_role() (0246), not is_tenant_admin() (0234): the latter
-- checks role = 'admin' but not is_active, so a deactivated admin with a live
-- session would keep the power to change the hospital's tax status. 0246
-- explains the trap and built this helper to avoid it.
--
-- Reading is unchanged: every member of staff still sees the profile, because
-- every bill they print needs the hospital's name and GST status. No DELETE
-- policy: nothing in the application deletes a hospital profile (the tenant
-- purge runs as the service role, which RLS does not apply to).

DROP POLICY IF EXISTS tenant_profile_upsert ON tenant_profiles;

DROP POLICY IF EXISTS tenant_profile_admin_insert ON tenant_profiles;
CREATE POLICY tenant_profile_admin_insert ON tenant_profiles
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT current_tenant_id())
    AND (SELECT current_active_role()) = 'admin'
  );

DROP POLICY IF EXISTS tenant_profile_admin_update ON tenant_profiles;
CREATE POLICY tenant_profile_admin_update ON tenant_profiles
  FOR UPDATE
  USING (
    tenant_id = (SELECT current_tenant_id())
    AND (SELECT current_active_role()) = 'admin'
  )
  WITH CHECK (
    tenant_id = (SELECT current_tenant_id())
    AND (SELECT current_active_role()) = 'admin'
  );

-- ── 2. A doctor could insert a lab order line into another hospital ─────────
--
-- lab_order_items had two PERMISSIVE INSERT policies, and permissive policies
-- are OR'd, so the weaker one decides:
--
--   lab_items_tenant_all (0011)  tenant_id = current_tenant_id() AND authenticated
--   lab_items_insert     (0004)  caller is an active admin or doctor — no tenant at all
--
-- Any active doctor or admin, at any hospital, could insert a row carrying
-- another hospital's tenant_id. Not reachable from the screens, which set the
-- tenant from the session, but reachable with a login and the public API —
-- the only cross-tenant write the audit found.
--
-- lab_items_tenant_all already admits every legitimate insert, so dropping the
-- older policy only removes the cross-tenant route. It cannot block anything
-- that works today: an OR loses a branch that was never needed for a row in
-- the caller's own hospital.

DROP POLICY IF EXISTS lab_items_insert ON lab_order_items;

NOTIFY pgrst, 'reload schema';
