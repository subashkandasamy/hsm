import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldCheck, Database, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { listTenants, getAdminStats, listSubscriptions, listPlatformAudit, listPartnerPayouts, signOutPlatformAdmin } from '@/app/actions/platform'
import PlatformAdminClient from './_components/PlatformAdminClient'
import MessagingToggle from './_components/MessagingToggle'

export const metadata = {
  title: 'Platform Admin — Uyirly',
  robots: { index: false, follow: false },
}
export const dynamic   = 'force-dynamic'

export default async function PlatformAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: pa } = await service
    .from('platform_admins')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!pa) redirect('/dashboard')

  const { data: msgSetting } = await service
    .from('platform_settings').select('value').eq('key', 'messaging_enabled').maybeSingle()
  const messagingEnabled = msgSetting?.value === 'true'

  const [tenants, stats, subscriptions, auditLog, partners] = await Promise.all([
    listTenants(),
    getAdminStats(),
    listSubscriptions(),
    listPlatformAudit(50),
    listPartnerPayouts(),
  ])

  return (
    <div className="min-h-screen px-4 py-8 md:py-12 overflow-x-hidden"
      style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F4C75 100%)' }}>
      <div className="max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 flex-wrap">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0891B2)' }}>
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate" style={{ color: '#F8FAFC' }}>Platform Admin</h1>
            <p className="text-xs truncate" style={{ color: '#64748B' }}>Uyirly SaaS — internal ops</p>
          </div>
          <Link href="/platform-admin/seeds"
            className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Database className="w-3.5 h-3.5" /> Seeds
          </Link>
          {/* There was no way out of this panel short of clearing cookies by
              hand, so a shared or borrowed machine kept signing straight back
              in to the screen that sees every hospital. */}
          <form action={signOutPlatformAdmin} className="shrink-0">
            <button type="submit"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'rgba(248,113,113,0.1)', color: '#F87171', border: '1px solid rgba(248,113,113,0.25)', cursor: 'pointer' }}>
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </form>
        </div>

        {/* MRR + stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[
            { label: 'MRR',       value: `₹${(stats.mrr_inr / 1000).toFixed(1)}k`, color: '#34D399' },
            { label: 'Total',     value: stats.total_tenants,   color: '#94A3B8' },
            { label: 'Active',    value: stats.active_tenants,  color: '#34D399' },
            { label: 'Trial',     value: stats.trial_tenants,   color: '#A78BFA' },
            { label: 'Past due',  value: stats.past_due_tenants,color: '#F87171' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-4 min-w-0"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-2xl font-bold mb-0.5 truncate" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs truncate" style={{ color: '#64748B' }}>{s.label}</p>
            </div>
          ))}
        </div>

        <MessagingToggle initial={messagingEnabled} />

        <PlatformAdminClient
          initialTenants={tenants}
          initialSubscriptions={subscriptions}
          initialAuditLog={auditLog}
          initialPartners={partners}
        />
      </div>
    </div>
  )
}
