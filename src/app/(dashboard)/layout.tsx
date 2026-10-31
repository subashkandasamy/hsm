import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { createServiceClient } from '@/lib/supabase/service'
import { AuthProvider } from '@/context/AuthContext'
import { TenantProvider } from '@/context/TenantContext'
import { ReadOnlyProvider } from '@/context/ReadOnlyContext'
import { MessagingProvider } from '@/context/MessagingContext'
import { isMessagingEnabled } from '@/lib/messaging'
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
  // served.
  //
  // This guard FAILS CLOSED. The comment here used to say x-tenant-id "is
  // absent only on bare-localhost dev", and that was not true: proxy.ts stamps
  // the tenant headers in exactly one place, inside the tenant-subdomain
  // branch, so they are missing on the apex, on app.{rootDomain}, and on ANY
  // hostname the proxy does not recognise — a *.vercel.app deployment URL
  // among them. That last branch checks the session and serves the request.
  //
  // Written as `if (currentTenantId && …)`, a missing header meant the
  // isolation check simply did not run, and nothing else covered it either:
  // hasModule() returns true with no x-tenant-plan, and isReadOnly is false
  // with no x-tenant-readonly. So an unrecognised host served the dashboard
  // with no tenant check, no plan gating and no read-only enforcement.
  //
  // Refusing is safe because a hospital always reaches Uyirly through its own
  // subdomain, which is the one path that does stamp these headers.
  const currentTenantId = hdrs.get('x-tenant-id')
  if (!currentTenantId) {
    // Bare-localhost development is the one legitimate case, and only there.
    const host = (hdrs.get('host') ?? '').split(':')[0]
    if (process.env.NODE_ENV !== 'development' || host !== 'localhost') {
      redirect('/login?notenant=1')
    }
  } else if (profile.tenant_id !== currentTenantId) {
    redirect('/login?wrongtenant=1')
  }

  // ── Account-state gates ───────────────────────────────────────────────────
  // Deactivated (e.g. resigned) staff are bounced to /login, which signs their
  // stale session out. Staff still holding a temporary password must set their
  // own before reaching any dashboard route; an expired temp password can only
  // be revived by an admin re-issuing credentials.
  if (!profile.is_active) {
    redirect('/login?deactivated=1')
  }
  if (profile.must_change_password) {
    const exp = profile.temp_password_expires_at
    if (exp && new Date(exp as string) < new Date()) {
      redirect('/login?tempexpired=1')
    }
    redirect('/change-password')
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

  const messagingEnabled = await isMessagingEnabled()

  return (
    <AuthProvider initialProfile={profile as Profile}>
      <TenantProvider plan={tenantPlan} status={tenantStatus}>
        <ReadOnlyProvider isReadOnly={isReadOnly}>
        <MessagingProvider enabled={messagingEnabled}>
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
        </MessagingProvider>
        </ReadOnlyProvider>
      </TenantProvider>
      <PushRegistration />
    </AuthProvider>
  )
}
