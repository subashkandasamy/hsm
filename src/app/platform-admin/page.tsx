import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { listTenants } from '@/app/actions/platform'
import PlatformAdminClient from './_components/PlatformAdminClient'

export const metadata = { title: 'Platform Admin — Uyirly' }

export default async function PlatformAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify platform admin
  const service = createServiceClient()
  const { data: pa } = await service
    .from('platform_admins')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!pa) redirect('/dashboard')

  const tenants = await listTenants()

  return (
    <div className="min-h-screen px-4 py-8 md:py-12"
      style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F4C75 100%)' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0891B2)' }}>
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#F8FAFC' }}>Platform Admin</h1>
            <p className="text-xs" style={{ color: '#64748B' }}>
              {tenants.length} tenant{tenants.length !== 1 ? 's' : ''} registered
            </p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {(
            [
              { label: 'Total', value: tenants.length, color: '#94A3B8' },
              { label: 'Active', value: tenants.filter(t => t.status === 'active').length, color: '#34D399' },
              { label: 'Trial', value: tenants.filter(t => t.status === 'trial').length, color: '#A78BFA' },
              { label: 'Suspended', value: tenants.filter(t => t.status === 'suspended').length, color: '#F87171' },
            ] as const
          ).map(stat => (
            <div key={stat.label} className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-2xl font-bold mb-0.5" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-xs" style={{ color: '#64748B' }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Client component */}
        <PlatformAdminClient initialTenants={tenants} />
      </div>
    </div>
  )
}
