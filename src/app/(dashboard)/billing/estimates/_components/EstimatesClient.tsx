'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, FileText, ChevronRight } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type { CostEstimate, WardRoomType, ProcedureTariff } from '@/lib/types'
import EstimateBuilderModal from './EstimateBuilderModal'

interface Props {
  initial: CostEstimate[]
  roomTypes: WardRoomType[]
  procedures: ProcedureTariff[]
}

export default function EstimatesClient({ initial, roomTypes, procedures }: Props) {
  const { profile } = useAuth()
  const canWrite = !!profile?.role && hasPermission(profile.role, 'billing:write', profile.granted_permissions)
  const router = useRouter()
  const [showNew, setShowNew] = useState(false)

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Cost Estimates"
        subtitle="Give patients an approximate cost before admission or surgery"
        actions={canWrite ? (
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: '#0D9488', border: 'none', cursor: 'pointer' }}>
            <Plus className="w-4 h-4" /> New Estimate
          </button>
        ) : undefined}
      />

      {initial.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: '#CBD5E1' }} />
          <p className="text-sm font-medium" style={{ color: '#475569' }}>No estimates yet</p>
          <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
            Create a cost estimate to share an approximate treatment cost with a patient.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {initial.map((e) => (
            <Link key={e.id} href={`/billing/estimates/${e.id}`}
              className="glass-card flex flex-col gap-2 px-4 py-3 transition-all sm:flex-row sm:items-center sm:gap-4"
              style={{ textDecoration: 'none' }}>
              <div className="flex items-center gap-4 min-w-0 sm:contents">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(13,148,136,0.08)' }}>
                <FileText className="w-4 h-4" style={{ color: '#0D9488' }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold break-words" style={{ color: '#0F172A' }}>
                  {e.patient?.full_name ?? e.patient_name ?? 'Walk-in enquiry'}
                </p>
                <p className="text-xs" style={{ color: '#94A3B8' }}>
                  {e.estimate_no} · <DateText date={e.created_at} />
                </p>
              </div>
              </div>
              <div className="flex items-center gap-3 sm:contents">
              <StatusBadge status={e.status === 'final' ? 'success' : 'info'} label={e.status === 'final' ? 'Final' : 'Draft'} />
              <span className="text-sm font-bold tabular-nums" style={{ color: '#0F172A' }}><Money amount={e.total} /></span>
              <ChevronRight className="w-4 h-4 flex-shrink-0 hidden sm:block" style={{ color: '#CBD5E1' }} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <EstimateBuilderModal
          roomTypes={roomTypes}
          procedures={procedures}
          onClose={() => setShowNew(false)}
          onSaved={(id) => { setShowNew(false); router.push(`/billing/estimates/${id}`) }}
        />
      )}
    </div>
  )
}
