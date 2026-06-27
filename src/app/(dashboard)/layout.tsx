import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AuthProvider } from '@/context/AuthContext'
import AppShell from '@/components/shell/AppShell'
import PushRegistration from '@/components/native/PushRegistration'
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

  const hdrs = await headers()
  const tenantName = hdrs.get('x-tenant-name') ?? 'Hospital'

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
      <AppShell role={profile.role} fullName={profile.full_name} tenantName={tenantName} enabledModules={enabledModules}>
        {children}
      </AppShell>
      <PushRegistration />
    </AuthProvider>
  )
}
