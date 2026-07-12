import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ShieldCheck, Database } from 'lucide-react'
import { listDrugMaster, listLabMaster, listRadiologyMaster } from '@/app/actions/seeds'
import SeedsClient from './_components/SeedsClient'

export const metadata = { title: 'Seeds — Platform Admin' }
export const dynamic   = 'force-dynamic'

export default async function SeedsPage() {
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

  // Fetch the tenants list for the procedure tariffs tab
  const { data: tenants } = await service
    .from('tenants')
    .select('id, name, slug')
    .not('status', 'eq', 'purged')
    .order('name')

  const [drugs, labTests, radiology] = await Promise.all([
    listDrugMaster(),
    listLabMaster(),
    listRadiologyMaster(),
  ])

  return (
    <div className="min-h-screen px-4 py-8 md:py-12"
      style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F4C75 100%)' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0891B2)' }}>
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#F8FAFC' }}>Master Data / Seeds</h1>
            <p className="text-xs" style={{ color: '#64748B' }}>Global catalogs shared across all tenants</p>
          </div>
          <a href="/platform-admin"
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }}>
            <ShieldCheck className="w-3.5 h-3.5" /> Admin
          </a>
        </div>

        {/* Counts */}
        <div className="flex gap-4 mb-8 mt-4">
          {[
            { label: 'Drugs',    value: drugs.length    },
            { label: 'Lab tests',value: labTests.length  },
            { label: 'Radiology',value: radiology.length },
          ].map(s => (
            <div key={s.label} className="text-xs" style={{ color: '#64748B' }}>
              <span style={{ color: '#94A3B8', fontWeight: 600 }}>{s.value}</span> {s.label}
            </div>
          ))}
        </div>

        <SeedsClient
          initialDrugs={drugs}
          initialLabTests={labTests}
          initialRadiology={radiology}
          tenants={(tenants ?? []) as { id: string; name: string; slug: string }[]}
        />
      </div>
    </div>
  )
}
