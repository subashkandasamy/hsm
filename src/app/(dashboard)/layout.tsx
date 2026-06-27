import { redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AuthProvider } from '@/context/AuthContext'
import AppShell from '@/components/shell/AppShell'
import SessionExpiryWarning from '@/components/shell/SessionExpiryWarning'
import PushRegistration from '@/components/native/PushRegistration'
import { SESSION_COOKIE } from '@/lib/sessionCookie'
import type { Profile } from '@/lib/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // x-tenant-name is injected by the proxy for every subdomain request
  const hdrs = await headers()
  const tenantName = hdrs.get('x-tenant-name') ?? 'Hospital'

  // Fetch enabled_modules for this tenant (service client to bypass RLS on tenants)
  const service = createServiceClient()
  const { data: tenant } = await service
    .from('tenants')
    .select('enabled_modules')
    .eq('id', profile.tenant_id)
    .single()
  const enabledModules: string[] = Array.isArray(tenant?.enabled_modules)
    ? tenant.enabled_modules as string[]
    : ['ipd','emergency','bloodbank','ot','lab','radiology','pharmacy','insurance','inventory','hr']

  // Extract loginAt timestamp for the pre-expiry warning component
  const cookieStore = await cookies()
  const la = cookieStore.get(SESSION_COOKIE)?.value
  let loginAtMs: number | null = null
  if (la) {
    const parts = la.split('.')
    const ts = parseInt(parts[1] ?? '', 10)
    if (!isNaN(ts)) loginAtMs = ts
  }

  return (
    <AuthProvider initialProfile={profile as Profile}>
      <AppShell role={profile.role} fullName={profile.full_name} tenantName={tenantName} enabledModules={enabledModules}>
        {children}
      </AppShell>
      <SessionExpiryWarning loginAtMs={loginAtMs} />
      <PushRegistration />
    </AuthProvider>
  )
}
