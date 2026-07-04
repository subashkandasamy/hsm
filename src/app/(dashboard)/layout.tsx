import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { createServiceClient } from '@/lib/supabase/service'
import { AuthProvider } from '@/context/AuthContext'
import { TenantProvider } from '@/context/TenantContext'
import AppShell from '@/components/shell/AppShell'
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

  if (!profile) redirect('/login')

  const hdrs = await headers()
  const tenantName   = hdrs.get('x-tenant-name')   ?? 'Hospital'
  const tenantPlan   = (hdrs.get('x-tenant-plan')   ?? 'starter') as PlanKey
  const tenantStatus = (hdrs.get('x-tenant-status') ?? 'trial')   as TenantStatus

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
      </TenantProvider>
      <PushRegistration />
    </AuthProvider>
  )
}
