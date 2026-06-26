import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuthProvider } from '@/context/AuthContext'
import AppShell from '@/components/shell/AppShell'
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

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', profile.tenant_id)
    .single()

  return (
    <AuthProvider initialProfile={profile as Profile}>
      <AppShell role={profile.role} fullName={profile.full_name} tenantName={tenant?.name ?? 'Hospital'}>
        {children}
      </AppShell>
    </AuthProvider>
  )
}
