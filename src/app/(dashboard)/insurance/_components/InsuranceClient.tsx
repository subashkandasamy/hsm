'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Building2, Landmark, Search, ChevronRight, Tag, FileStack, Loader2, UserRound } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import Money from '@/components/ui/Money'
import EmptyState from '@/components/ui/EmptyState'
import { listClaims } from '@/app/actions/insurance'
import { searchPatients } from '@/app/actions/patients'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type { InsuranceClaim, InsuranceClaimStatus, InsuranceReceivables, InsuranceTpa, InsuranceBankAccount, InsuranceTariffPackage, InsuranceRemittanceBatch, Patient } from '@/lib/types'
import TpaManagerModal from './TpaManagerModal'
import BankAccountManagerModal from './BankAccountManagerModal'
import TariffPackageManagerModal from './TariffPackageManagerModal'
import RemittanceManagerModal from './RemittanceManagerModal'

const STATUS_MAP: Record<InsuranceClaimStatus, string> = {
  draft:                'info',
  awaiting_eligibility:  'info',
  raised:                'info',
  submitted:             'pending',
  approved:              'success',
  rejected:              'danger',
  settled:               'cancelled',
}

const STATUS_LABEL: Record<InsuranceClaimStatus, string> = {
  draft:                'Draft',
  awaiting_eligibility:  'Eligibility Check',
  raised:                'Raised',
  submitted:             'Submitted',
  approved:              'Approved',
  rejected:              'Rejected',
  settled:               'Settled',
}

type Tab = 'in_progress' | 'approved' | 'rejected' | 'settled' | 'history'

const TABS: { key: Tab; label: string; statuses: InsuranceClaimStatus[] | null }[] = [
  { key: 'in_progress', label: 'In Progress', statuses: ['draft', 'awaiting_eligibility', 'raised', 'submitted'] },
  { key: 'approved',    label: 'Approved',    statuses: ['approved'] },
  { key: 'rejected',    label: 'Rejected',    statuses: ['rejected'] },
  { key: 'settled',     label: 'Settled',     statuses: ['settled'] },
  { key: 'history',     label: 'History',     statuses: null },
]

function claimPatient(claim: InsuranceClaim) {
  const p = (claim.policy as unknown as { patient?: { id: string; full_name: string; uhid: string } } | null)?.patient
  return p ?? (claim.patient ? { id: claim.patient.id, full_name: claim.patient.full_name, uhid: claim.patient.uhid } : null)
}

interface Props {
  initialClaims: InsuranceClaim[]
  receivables: InsuranceReceivables
  initialTpas: InsuranceTpa[]
  initialBankAccounts: InsuranceBankAccount[]
  initialTariffPackages: InsuranceTariffPackage[]
  initialRemittanceBatches: InsuranceRemittanceBatch[]
}

export default function InsuranceClient({ initialClaims, receivables, initialTpas, initialBankAccounts, initialTariffPackages, initialRemittanceBatches }: Props) {
  const router = useRouter()
  const { profile } = useAuth()
  const role = profile?.role
  const canWrite = !!role && hasPermission(role, 'insurance:write')

  const [claims, setClaims]   = useState(initialClaims)
  const [loading, setLoading] = useState(false)
  const [tab, setTab]         = useState<Tab>('in_progress')
  const [search, setSearch]   = useState('')
  const [showTpa, setShowTpa] = useState(false)
  const [showBankAccounts, setShowBankAccounts] = useState(false)
  const [showTariffs, setShowTariffs] = useState(false)
  const [showRemittances, setShowRemittances] = useState(false)

  // Search is a real patient finder (like the Patients page): it hits every
  // patient, not just those who already have a claim — that's how a fresh
  // insurance case is started.
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [searchingPatients, setSearchingPatients] = useState(false)

  useEffect(() => {
    if (!search.trim()) { setPatientResults([]); return }
    const t = setTimeout(async () => {
      setSearchingPatients(true)
      setPatientResults(await searchPatients(search))
      setSearchingPatients(false)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  async function refresh() {
    setLoading(true)
    setClaims(await listClaims())
    setLoading(false)
  }

  // A quick lookup of a patient's most-recent claim status, to annotate search results.
  const latestByPatient = useMemo(() => {
    const m = new Map<string, InsuranceClaim>()
    for (const c of claims) {
      const p = claimPatient(c)
      if (!p) continue
      const cur = m.get(p.id)
      if (!cur || c.created_at > cur.created_at) m.set(p.id, c)
    }
    return m
  }, [claims])

  const activeTab = TABS.find((t) => t.key === tab)!

  // Group the active tab's claims by patient — one card per patient, most-recent claim summarized.
  const patientCards = useMemo(() => {
    const bucket = activeTab.statuses ? claims.filter((c) => activeTab.statuses!.includes(c.status)) : claims
    const byPatient = new Map<string, { patientId: string; name: string; uhid: string; count: number; latest: InsuranceClaim }>()
    for (const c of bucket) {
      const p = claimPatient(c)
      if (!p) continue
      const existing = byPatient.get(p.id)
      if (!existing) {
        byPatient.set(p.id, { patientId: p.id, name: p.full_name, uhid: p.uhid, count: 1, latest: c })
      } else {
        existing.count += 1
        if (c.created_at > existing.latest.created_at) existing.latest = c
      }
    }
    let cards = Array.from(byPatient.values())
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      cards = cards.filter((c) => c.name.toLowerCase().includes(q) || c.uhid.toLowerCase().includes(q))
    }
    return cards.sort((a, b) => b.latest.created_at.localeCompare(a.latest.created_at))
  }, [claims, activeTab, search])

  return (
    <div>
      <PageHeader
        title="Insurance"
        subtitle="Eligibility checks and cashless claims"
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
                onClick={() => setShowBankAccounts(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}
              >
                <Landmark className="w-4 h-4" />
                Bank Accounts
              </button>
              <button
                onClick={() => setShowTariffs(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}
              >
                <Tag className="w-4 h-4" />
                Tariffs
              </button>
              <button
                onClick={() => setShowRemittances(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}
              >
                <FileStack className="w-4 h-4" />
                Remittances
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

      {/* Search — the primary way in: find a patient, then open their insurance page */}
      <div className="mb-4 relative w-full">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#94A3B8' }} />
        <input
          type="search"
          placeholder="Search by patient name or UHID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-3.5 rounded-2xl text-base"
          style={{ minHeight: '52px', background: 'rgba(255,255,255,0.92)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
        />
      </div>

      {search.trim() ? (
        /* ── Patient search results — every patient, to start or open insurance ── */
        <div>
          {searchingPatients && (
            <div className="flex items-center gap-2 text-sm px-1 mb-2" style={{ color: '#94A3B8' }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Searching…
            </div>
          )}
          {patientResults.length === 0 && !searchingPatients ? (
            <GlassCard>
              <EmptyState title="No patients found" description="Try a different name, phone, or UHID." />
            </GlassCard>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid #E2E8F0' }}>
              {patientResults.map((p, i) => {
                const latest = latestByPatient.get(p.id)
                return (
                  <button key={p.id} onClick={() => router.push(`/insurance/${p.id}`)}
                    className="w-full text-left flex items-center gap-3 px-4 py-3"
                    style={{ borderBottom: i < patientResults.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.03)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
                      <UserRound className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{p.full_name}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{p.uhid}{p.phone ? ` · ${p.phone}` : ''}</p>
                    </div>
                    {latest
                      ? <StatusBadge status={STATUS_MAP[latest.status]} label={STATUS_LABEL[latest.status]} />
                      : <span className="text-xs font-medium" style={{ color: '#0D9488' }}>Start insurance</span>}
                    <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#CBD5E1' }} />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="overflow-x-auto -mx-4 px-4 mb-4">
            <div className="flex gap-1 p-1 rounded-xl w-max"
              style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
              {TABS.map((t) => {
                const count = t.statuses ? claims.filter((c) => t.statuses!.includes(c.status)).length : claims.length
                return (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className="px-4 py-2 rounded-lg text-sm font-medium flex-shrink-0"
                    style={tab === t.key ? { background: '#0D9488', color: '#fff' } : { color: '#64748B', background: 'transparent' }}>
                    {t.label} <span style={{ opacity: 0.75 }}>({count})</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Patient cards for the active tab */}
          {patientCards.length === 0 ? (
            <GlassCard>
              <EmptyState title="No claims in this tab"
                description="Search a patient above to start or open their insurance." />
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {patientCards.map((card) => (
                <button key={card.patientId} onClick={() => router.push(`/insurance/${card.patientId}`)}
                  className="text-left p-4 rounded-2xl transition-all"
                  style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{card.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{card.uhid}</p>
                    </div>
                    <StatusBadge status={STATUS_MAP[card.latest.status]} label={STATUS_LABEL[card.latest.status]} />
                  </div>
                  <div className="space-y-1 text-xs" style={{ color: '#64748B' }}>
                    <div className="flex justify-between">
                      <span>{card.latest.admission_id ? 'IPD' : card.latest.visit_id ? 'OPD' : 'Bill'}</span>
                      <Money amount={card.latest.claim_amount ?? card.latest.estimated_amount ?? 0} className="font-semibold" />
                    </div>
                    <p style={{ color: '#CBD5E1' }}>{card.latest.policy?.provider} · {card.latest.policy?.policy_no}</p>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    {card.count > 1 ? (
                      <span className="text-xs font-medium" style={{ color: '#0D9488' }}>{card.count} claims</span>
                    ) : <span />}
                    <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: '#0D9488' }}>
                      View <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showTpa && (
        <TpaManagerModal initialTpas={initialTpas} onClose={() => setShowTpa(false)} />
      )}
      {showBankAccounts && (
        <BankAccountManagerModal initialAccounts={initialBankAccounts} onClose={() => setShowBankAccounts(false)} />
      )}
      {showTariffs && (
        <TariffPackageManagerModal initialPackages={initialTariffPackages} tpas={initialTpas.filter((t) => t.is_active)} onClose={() => setShowTariffs(false)} />
      )}
      {showRemittances && (
        <RemittanceManagerModal initialBatches={initialRemittanceBatches} bankAccounts={initialBankAccounts.filter((a) => a.is_active)} onClose={() => setShowRemittances(false)} />
      )}
    </div>
  )
}
