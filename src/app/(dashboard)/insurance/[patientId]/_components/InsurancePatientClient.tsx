'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight, BedDouble, Stethoscope, RotateCcw } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import { claimHeadline } from '@/lib/insurance/claimAmount'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import EmptyState from '@/components/ui/EmptyState'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type { Patient, InsurancePatientEncounter, InsurancePolicy, InsuranceClaimStatus } from '@/lib/types'

const STATUS_MAP: Record<InsuranceClaimStatus, string> = {
  draft: 'info', awaiting_eligibility: 'info', raised: 'info', submitted: 'pending',
  approved: 'success', rejected: 'danger', settled: 'cancelled',
}
const STATUS_LABEL: Record<InsuranceClaimStatus, string> = {
  draft: 'Draft', awaiting_eligibility: 'Eligibility Check', raised: 'Raised', submitted: 'Submitted',
  approved: 'Approved', rejected: 'Rejected', settled: 'Settled',
}

interface Props { patient: Patient; initialEncounters: InsurancePatientEncounter[]; initialPolicies: InsurancePolicy[] }

export default function InsurancePatientClient({ patient, initialEncounters }: Props) {
  const router = useRouter()
  const { profile } = useAuth()
  const role = profile?.role
  const canWrite = !!role && hasPermission(role, 'insurance:write', profile?.granted_permissions)

  function openEncounter(enc: InsurancePatientEncounter) {
    // Most recent claim on this encounter that isn't rejected wins; if every
    // attempt was rejected (or none exist yet), start a fresh one.
    const active = [...enc.claims].sort((a, b) => b.created_at.localeCompare(a.created_at))
      .find((c) => c.status !== 'rejected')
    if (active) { router.push(`/insurance/${patient.id}/${active.id}`); return }
    // A pre-visit appointment scopes the claim to its consultation bill.
    if (enc.type === 'appointment') router.push(`/insurance/${patient.id}/new?type=bill&id=${enc.billId}`)
    else router.push(`/insurance/${patient.id}/new?type=${enc.type}&id=${enc.id}`)
  }

  return (
    <div>
      <button onClick={() => router.push('/insurance')}
        className="flex items-center gap-1.5 text-sm mb-3" style={{ color: '#64748B' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Insurance
      </button>

      <PageHeader
        title={patient.full_name}
        subtitle={`${patient.uhid}${patient.phone ? ` · ${patient.phone}` : ''}`}
      />

      {initialEncounters.length === 0 ? (
        <GlassCard>
          <EmptyState title="No OPD visits or IPD admissions yet"
            description="This patient has no encounters to start an insurance claim against."
            icon={<BedDouble className="w-6 h-6" style={{ color: '#94A3B8' }} />} />
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {initialEncounters.map((enc) => {
            const sorted = [...enc.claims].sort((a, b) => b.created_at.localeCompare(a.created_at))
            const latest = sorted[0]
            const allRejected = enc.claims.length > 0 && enc.claims.every((c) => c.status === 'rejected')

            return (
              <button key={enc.key} onClick={() => canWrite && openEncounter(enc)} disabled={!canWrite}
                className="text-left p-4 rounded-2xl transition-all"
                style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: canWrite ? 'pointer' : 'default' }}
                onMouseEnter={(e) => { if (canWrite) e.currentTarget.style.borderColor = '#0D9488' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(13,148,136,0.06)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.14)' }}>
                    {enc.type === 'admission' ? <BedDouble className="w-3 h-3" /> : <Stethoscope className="w-3 h-3" />}
                    {enc.type === 'admission' ? 'IPD' : 'OPD'}
                  </span>
                  {latest && <StatusBadge status={STATUS_MAP[latest.status]} label={STATUS_LABEL[latest.status]} />}
                </div>
                <p className="text-xs mb-2" style={{ color: '#94A3B8' }}><DateText date={enc.date} /></p>

                {latest ? (
                  <div className="space-y-1 text-xs" style={{ color: '#64748B' }}>
                    <div className="flex justify-between items-baseline gap-2">
                      <span>{latest.policy?.provider ?? '—'}</span>
                      <span className="text-right">
                        <Money amount={claimHeadline(latest).amount} className="font-semibold" />
                        {claimHeadline(latest).note && (
                          <span className="block" style={{ color: '#B45309' }}>{claimHeadline(latest).note}</span>
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-medium" style={{ color: '#0D9488' }}>Not started — click to begin</p>
                )}

                <div className="mt-2.5 flex items-center justify-between">
                  {allRejected ? (
                    <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#B45309' }}>
                      <RotateCcw className="w-3 h-3" /> Start new claim
                    </span>
                  ) : enc.claims.length > 1 ? (
                    <span className="text-xs font-medium" style={{ color: '#0D9488' }}>{enc.claims.length} attempts</span>
                  ) : <span />}
                  {canWrite && (
                    <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: '#0D9488' }}>
                      {latest ? 'View' : 'Start'} <ChevronRight className="w-3 h-3" />
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
