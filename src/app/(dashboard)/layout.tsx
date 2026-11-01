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
  // Named columns, not '*'. This is NOT a performance fix and was measured
  // before being written: `profiles` has exactly 12 columns and this list is
  // all 12, so the two fetch identical data. The reason is forward-looking —
  // this row is handed to the client as `initialProfile`, so with '*' any
  // column added to `profiles` later (a token, a hash, a note) would ship to
  // the browser the day it is created, silently. Naming them means a new
  // column has to be chosen.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, phone, phone_verified, department_id, is_active, sees_patients, must_change_password, temp_password_expires_at, created_at, tenant_id')
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

  // The proxy already read this row to resolve the tenant, so it stamps the
  // modules too — this used to be a service-role query on EVERY dashboard
  // navigation for a value that changes almost never (F-19). The query below
  // runs only when the header is absent: bare-localhost development, or a
  // tenant whose column held something unusable.
  const headerModules = hdrs.get('x-tenant-modules')
  let fromHeader: string[] | null = null
  if (headerModules) {
    try {
      const parsed = JSON.parse(headerModules)
      if (Array.isArray(parsed)) fromHeader = parsed as string[]
    } catch {
      // Malformed header: fall through to the query rather than trusting it.
    }
  }

  const service = createServiceClient()
  const { data: tenant, error: tenantErr } = fromHeader
    ? { data: { enabled_modules: fromHeader }, error: null }
    : await service
        .from('tenants')
        .select('enabled_modules')
        .eq('id', profile.tenant_id)
        .single()

  // The fallback mirrors the column's own DEFAULT — enabled_modules is jsonb
  // NOT NULL with exactly this list as its default — so a tenant that has never
  // configured anything sees the same menu either way. An empty array is
  // respected as "nothing enabled", because Array.isArray([]) is true.
  //
  // What it cannot do is tell "this tenant wants everything" apart from "the
  // row could not be read", and silently enabling all ten in the second case is
  // the wrong default to pick quietly. It is the sidebar rather than a security
  // boundary — plan gating (planHasModule) and RLS both still apply to anything
  // clicked — so blanking the menu on a transient read error would make a
  // working hospital look broken for no safety gain. The fallback stays; it just
  // no longer happens in silence.
  const DEFAULT_MODULES =
    ['ipd','emergency','bloodbank','ot','lab','radiology','pharmacy','insurance','inventory','hr']
  const configured = Array.isArray(tenant?.enabled_modules)
  if (!configured) {
    console.error('[layout] enabled_modules unusable — falling back to the full list', {
      tenantId: profile.tenant_id,
      error: tenantErr?.message ?? null,
      received: tenant?.enabled_modules ?? null,
    })
  }
  const enabledModules: string[] = configured
    ? tenant!.enabled_modules as string[]
    : DEFAULT_MODULES

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
