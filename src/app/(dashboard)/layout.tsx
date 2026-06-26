import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
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

  // x-tenant-name is injected by the proxy for every subdomain request
  const hdrs = await headers()
  const tenantName = hdrs.get('x-tenant-name') ?? 'Hospital'

  return (
    <AuthProvider initialProfile={profile as Profile}>
      <AppShell role={profile.role} fullName={profile.full_name} tenantName={tenantName}>
        {children}
      </AppShell>
    </AuthProvider>
  )
}
