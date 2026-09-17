-- platform_admins' own SELECT policy queried platform_admins, so any policy that
-- checks it (tenants UPDATE, platform_admins INSERT) failed with "infinite recursion
-- detected in policy". Check membership through a SECURITY DEFINER function instead.
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM platform_admins WHERE id = auth.uid()) $$;
REVOKE ALL ON FUNCTION is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated;

DROP POLICY IF EXISTS platform_admins_read ON platform_admins;
CREATE POLICY platform_admins_read ON platform_admins FOR SELECT USING (is_platform_admin());
DROP POLICY IF EXISTS platform_admins_write ON platform_admins;
CREATE POLICY platform_admins_write ON platform_admins FOR INSERT WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS platform_admin_all_tenants ON tenants;
CREATE POLICY platform_admin_all_tenants ON tenants FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS tenants_own_read ON tenants;
CREATE POLICY tenants_own_read ON tenants FOR SELECT USING (id = current_tenant_id() OR is_platform_admin());

DROP POLICY IF EXISTS subscriptions_service_write ON subscriptions;
CREATE POLICY subscriptions_service_write ON subscriptions FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS subscriptions_tenant_read ON subscriptions;
CREATE POLICY subscriptions_tenant_read ON subscriptions FOR SELECT USING (tenant_id = current_tenant_id() OR is_platform_admin());
DROP POLICY IF EXISTS paa_read ON platform_admin_audit;
CREATE POLICY paa_read ON platform_admin_audit FOR SELECT USING (is_platform_admin());

NOTIFY pgrst, 'reload schema';
