import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { createServiceClient } from '@/lib/supabase/service'
import { AuthProvider } from '@/context/AuthContext'
import { TenantProvider } from '@/context/TenantContext'
import { ReadOnlyProvider } from '@/context/ReadOnlyContext'
import AppShell from '@/components/shell/AppShell'
import ReadOnlyBanner from '@/components/ui/ReadOnlyBanner'
import PushRegistration from '@/components/native/PushRegistration'
import type { Profile } from '@/lib/types'
import type { PlanKey, TenantStatus } from '@/lib/plans'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    // Platform admin has no tenant profile — send them to their own panel
    const service = createServiceClient()
    const { data: pa } = await service
      .from('platform_admins')
      .select('id')
      .eq('id', user.id)
      .single()
    // ?wrongtenant=1 prevents the proxy from auto-redirecting back to /dashboard
    redirect(pa ? '/platform-admin' : '/login?wrongtenant=1')
  }

  const hdrs = await headers()
  const tenantName   = hdrs.get('x-tenant-name')   ?? 'Hospital'
  const tenantPlan   = (hdrs.get('x-tenant-plan')   ?? 'starter') as PlanKey
  const tenantStatus = (hdrs.get('x-tenant-status') ?? 'trial')   as TenantStatus
  const isReadOnly   = hdrs.get('x-tenant-readonly') === '1'

  // ── Tenant isolation guard ────────────────────────────────────────────────
  // Supabase sessions are shared across every *.uyirly.com subdomain, so a user
  // from one tenant could otherwise open another tenant's subdomain while signed
  // in. Enforce here that the profile's tenant matches the subdomain being
  // served. (x-tenant-id is absent only on bare-localhost dev, where we skip it.)
  const currentTenantId = hdrs.get('x-tenant-id')
  if (currentTenantId && profile.tenant_id !== currentTenantId) {
    redirect('/login?wrongtenant=1')
  }

  const service = createServiceClient()
  const { data: tenant } = await service
    .from('tenants')
    .select('enabled_modules')
    .eq('id', profile.tenant_id)
    .single()

  const enabledModules: string[] = Array.isArray(tenant?.enabled_modules)
    ? tenant.enabled_modules as string[]
    : ['ipd','emergency','bloodbank','ot','lab','radiology','pharmacy','insurance','inventory','hr']

  return (
    <AuthProvider initialProfile={profile as Profile}>
      <TenantProvider plan={tenantPlan} status={tenantStatus}>
        <ReadOnlyProvider isReadOnly={isReadOnly}>
          <ReadOnlyBanner />
          <AppShell
            role={profile.role}
            fullName={profile.full_name}
            tenantName={tenantName}
            enabledModules={enabledModules}
            plan={tenantPlan}
            status={tenantStatus}
          >
            {children}
          </AppShell>
        </ReadOnlyProvider>
      </TenantProvider>
      <PushRegistration />
    </AuthProvider>
  )
}
