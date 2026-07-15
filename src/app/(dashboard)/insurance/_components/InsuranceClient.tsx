'use client'

import { useState } from 'react'
import { Plus, RefreshCw, ShieldPlus, Building2, ChevronRight } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import Money from '@/components/ui/Money'
import { listClaims } from '@/app/actions/insurance'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type { InsuranceClaim, InsuranceClaimStatus, InsuranceReceivables, InsuranceTpa } from '@/lib/types'
import AddPolicyModal from './AddPolicyModal'
import NewClaimModal from './NewClaimModal'
import AdvanceClaimModal from './AdvanceClaimModal'
import TpaManagerModal from './TpaManagerModal'

const STATUS_MAP: Record<InsuranceClaimStatus, string> = {
  draft:     'info',
  preauth:   'info',
  submitted: 'pending',
  approved:  'success',
  rejected:  'danger',
  settled:   'cancelled',
}

const KANBAN_COLS: { key: InsuranceClaimStatus; label: string }[] = [
  { key: 'draft',     label: 'Draft' },
  { key: 'preauth',   label: 'Pre-Auth' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'approved',  label: 'Approved' },
  { key: 'rejected',  label: 'Rejected' },
  { key: 'settled',   label: 'Settled' },
]

interface Props { initialClaims: InsuranceClaim[]; receivables: InsuranceReceivables; initialTpas: InsuranceTpa[] }

export default function InsuranceClient({ initialClaims, receivables, initialTpas }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canWrite = !!role && hasPermission(role, 'insurance:write')

  const [claims, setClaims]             = useState(initialClaims)
  const [loading, setLoading]           = useState(false)
  const [showAddPolicy, setShowAddPolicy] = useState(false)
  const [showNewClaim, setShowNewClaim] = useState(false)
  const [showTpa, setShowTpa]           = useState(false)
  const [advancingClaim, setAdvancingClaim] = useState<InsuranceClaim | null>(null)
  const [mobileFilter, setMobileFilter] = useState<InsuranceClaimStatus | 'all'>('all')

  async function refresh() {
    setLoading(true)
    const data = await listClaims()
    setClaims(data)
    setLoading(false)
  }

  const claimsByStatus = KANBAN_COLS.reduce<Record<InsuranceClaimStatus, InsuranceClaim[]>>(
    (acc, col) => {
      acc[col.key] = claims.filter((c) => c.status === col.key)
      return acc
    },
    {} as Record<InsuranceClaimStatus, InsuranceClaim[]>
  )

  const filteredClaims = mobileFilter === 'all'
    ? claims
    : claims.filter((c) => c.status === mobileFilter)

  return (
    <div>
      <PageHeader
        title="Insurance"
        subtitle="Policies, claims and reimbursements"
        actions={
          canWrite ? (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setShowTpa(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}
              >
                <Building2 className="w-4 h-4" />
                TPAs
              </button>
              <button
                onClick={() => setShowAddPolicy(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: 'rgba(255,255,255,0.8)',
                  border: '1px solid #0D9488',
                  color: '#0D9488',
                  minHeight: '44px',
                }}
              >
                <ShieldPlus className="w-4 h-4" />
                Add Policy
              </button>
              <button
                onClick={() => setShowNewClaim(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: '#0D9488', minHeight: '44px' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}
              >
                <Plus className="w-4 h-4" />
                New Claim
              </button>
              <button
                onClick={refresh}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm"
                style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          ) : undefined
        }
      />

      {/* Receivables summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Awaiting decision', value: receivables.pending, color: '#B45309' },
          { label: 'Approved (to receive)', value: receivables.approved, color: '#0D9488' },
          { label: 'Settled this month', value: receivables.settledThisMonth, color: '#10B981' },
          { label: '60+ days pending', value: receivables.agingBuckets.find((b) => b.label === '60+ days')?.amount ?? 0, color: '#DC2626' },
        ].map((s) => (
          <GlassCard key={s.label} className="p-3">
            <p className="text-xs mb-1" style={{ color: '#64748B' }}>{s.label}</p>
            <Money amount={s.value} className="text-lg font-bold" style={{ color: s.color }} />
          </GlassCard>
        ))}
      </div>

      {/* Desktop kanban */}
      <div className="hidden md:block overflow-x-auto">
        <div className="flex gap-3 min-w-max pb-4">
          {KANBAN_COLS.map((col) => {
            const colClaims = claimsByStatus[col.key]
            return (
              <div
                key={col.key}
                className="flex flex-col gap-2"
                style={{ width: '220px' }}
              >
                <div className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>
                    {col.label}
                  </span>
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: '#E2E8F0', color: '#64748B' }}>
                    {colClaims.length}
                  </span>
                </div>

                {colClaims.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs rounded-xl"
                    style={{ color: '#CBD5E1', border: '1px dashed #E2E8F0' }}>
                    No claims
                  </div>
                ) : (
                  colClaims.map((claim) => (
                    <ClaimCard
                      key={claim.id}
                      claim={claim}
                      canWrite={canWrite}
                      onAdvance={() => setAdvancingClaim(claim)}
                    />
                  ))
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Mobile: status-filtered list */}
      <div className="md:hidden">
        {/* Status filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          <button
            onClick={() => setMobileFilter('all')}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              background: mobileFilter === 'all' ? '#0D9488' : '#F1F5F9',
              color: mobileFilter === 'all' ? '#fff' : '#64748B',
            }}
          >
            All ({claims.length})
          </button>
          {KANBAN_COLS.map((col) => (
            <button
              key={col.key}
              onClick={() => setMobileFilter(col.key)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: mobileFilter === col.key ? '#0D9488' : '#F1F5F9',
                color: mobileFilter === col.key ? '#fff' : '#64748B',
              }}
            >
              {col.label} ({claimsByStatus[col.key].length})
            </button>
          ))}
        </div>

        <GlassCard>
          {filteredClaims.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>
              No claims in this status
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {filteredClaims.map((claim) => (
                <ClaimCard
                  key={claim.id}
                  claim={claim}
                  canWrite={canWrite}
                  onAdvance={() => setAdvancingClaim(claim)}
                  mobile
                />
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Modals */}
      {showAddPolicy && (
        <AddPolicyModal onClose={() => setShowAddPolicy(false)} onAdded={refresh} />
      )}
      {showNewClaim && (
        <NewClaimModal onClose={() => setShowNewClaim(false)} onCreated={refresh} />
      )}
      {showTpa && (
        <TpaManagerModal initialTpas={initialTpas} onClose={() => setShowTpa(false)} />
      )}
      {advancingClaim && (
        <AdvanceClaimModal
          claim={advancingClaim}
          onClose={() => setAdvancingClaim(null)}
          onAdvanced={async () => { setAdvancingClaim(null); await refresh() }}
        />
      )}
    </div>
  )
}

function ClaimCard({
  claim, canWrite, onAdvance, mobile,
}: {
  claim: InsuranceClaim
  canWrite: boolean
  onAdvance: () => void
  mobile?: boolean
}) {
  const patient = (claim.policy as { patient?: { full_name?: string; uhid?: string } } | null)?.patient
  const patientName = patient?.full_name ?? claim.patient?.full_name ?? '—'
  const patientUhid = patient?.uhid ?? claim.patient?.uhid ?? ''

  return (
    <div
      className={`glass-card p-3 ${mobile ? '' : 'rounded-xl'}`}
      style={mobile ? { borderRadius: 0, background: 'transparent', boxShadow: 'none' } : {}}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{patientName}</p>
          <p className="text-xs" style={{ color: '#94A3B8' }}>{patientUhid}</p>
        </div>
        <StatusBadge status={STATUS_MAP[claim.status]} label={claim.status} />
      </div>

      <div className="space-y-1 text-xs" style={{ color: '#64748B' }}>
        <div className="flex justify-between">
          <span>{claim.claim_type === 'reimbursement' ? 'Reimbursement' : 'Cashless'}</span>
          <span style={{ color: '#0D9488' }}>
            {claim.admission_id ? 'IPD' : claim.visit_id ? 'OPD' : claim.bill?.bill_no ?? '—'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>{claim.status === 'preauth' ? 'Estimate' : 'Claim'}</span>
          <Money amount={claim.claim_amount ?? claim.estimated_amount ?? 0} className="font-semibold" />
        </div>
        {claim.approved_amount != null && (
          <div className="flex justify-between">
            <span>Approved</span>
            <Money amount={claim.approved_amount} className="font-semibold" style={{ color: '#10B981' }} />
          </div>
        )}
        <p className="text-xs" style={{ color: '#CBD5E1' }}>
          {claim.policy?.provider} · {claim.policy?.policy_no}
        </p>
      </div>

      {canWrite && !['rejected', 'settled'].includes(claim.status) && (
        <button
          onClick={onAdvance}
          className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-all"
          style={{ background: '#F1F5F9', color: '#0D9488', minHeight: '36px' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.08)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9' }}
        >
          Advance <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
