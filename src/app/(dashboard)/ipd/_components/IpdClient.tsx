'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, RefreshCw, BedDouble } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import EmptyState from '@/components/ui/EmptyState'
import { listAdmissions } from '@/app/actions/ipd'
import { getWardBoard } from '@/app/actions/wards'
import AdmitModal from '../../wards/_components/AdmitModal'
import type { Admission, Ward, WardWithBeds, ProcedureTariff } from '@/lib/types'

function daysAdmitted(admittedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(admittedAt).getTime()) / 86400000))
}

interface Props {
  initialAdmissions: Admission[]
  wards: Ward[]
  doctors: { id: string; full_name: string }[]
  procedureTariffs?: ProcedureTariff[]
  generalTariffPrice?: number
  advancePercentage?: number
}

export default function IpdClient({ initialAdmissions, wards, doctors, procedureTariffs = [], generalTariffPrice, advancePercentage = 50 }: Props) {
  const router = useRouter()
  const [admissions, setAdmissions] = useState<Admission[]>(initialAdmissions)
  const [statusFilter, setStatusFilter] = useState<'admitted' | 'discharged' | 'all'>('admitted')
  const [loading, setLoading] = useState(false)
  const [showAdmit, setShowAdmit] = useState(false)
  const [wardBoard, setWardBoard] = useState<WardWithBeds[]>([])

  async function refresh(status: typeof statusFilter) {
    setLoading(true)
    const data = await listAdmissions(status === 'all' ? {} : { status })
    setAdmissions(data)
    setLoading(false)
  }

  async function openAdmitModal() {
    const board = await getWardBoard()
    setWardBoard(board)
    setShowAdmit(true)
  }

  const displayed = admissions

  const wardOptions = wardBoard.map(w => ({
    id: w.id,
    name: w.name,
    availableBeds: w.beds.filter(b => b.status === 'available'),
  }))

  return (
    <div>
      <PageHeader
        title="Inpatient (IPD)"
        subtitle="Current admissions and inpatient management"
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => refresh(statusFilter)}
              className="p-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={openAdmitModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}>
              <UserPlus className="w-4 h-4" /> Admit Patient
            </button>
          </div>
        }
      />

      {/* Status filter tabs */}
      <div className="overflow-x-auto -mx-4 px-4 mb-5">
        <div className="flex gap-1 p-1 rounded-xl w-max"
          style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
          {(['admitted', 'discharged', 'all'] as const).map((s) => (
            <button key={s} onClick={() => { setStatusFilter(s); refresh(s) }}
              className="px-4 py-2 rounded-lg text-sm font-medium capitalize flex-shrink-0"
              style={statusFilter === s ? { background: '#0D9488', color: '#fff' } : { color: '#64748B', background: 'transparent' }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm" style={{ color: '#94A3B8' }}>Loading…</div>
        ) : displayed.length === 0 ? (
          <EmptyState title="No admissions found"
            description={statusFilter === 'admitted' ? 'Admit a patient to get started.' : 'No records match the filter.'}
            icon={<BedDouble className="w-6 h-6" style={{ color: '#94A3B8' }} />} />
        ) : (
          <>
            {/* ── MOBILE CARDS (< md) ── */}
            <div className="md:hidden divide-y" style={{ borderColor: '#F1F5F9' }}>
              {displayed.map((a) => (
                <button key={a.id} onClick={() => router.push(`/ipd/${a.id}`)}
                  className="w-full text-left px-4 py-3.5"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{a.patient?.full_name ?? '—'}</p>
                      <p className="font-mono text-xs" style={{ color: '#94A3B8' }}>{a.patient?.uhid}</p>
                    </div>
                    <StatusBadge status={a.status === 'admitted' ? 'active' : a.status === 'discharged' ? 'success' : 'pending'}
                      label={a.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div><span style={{ color: '#94A3B8' }}>Ward </span>
                      <span style={{ color: '#475569' }}>{a.ward?.name ?? '—'} · Bed {a.bed?.bed_no}</span></div>
                    <div><span style={{ color: '#94A3B8' }}>Doctor </span>
                      <span style={{ color: '#475569' }}>{a.doctor?.full_name ?? '—'}</span></div>
                    <div><span style={{ color: '#94A3B8' }}>Admitted </span>
                      <span style={{ color: '#475569' }}><DateText date={a.admitted_at} /></span></div>
                    {a.status === 'admitted' && (
                      <div><span style={{ color: '#94A3B8' }}>Days </span>
                        <span className="font-semibold" style={{ color: '#0D9488' }}>{daysAdmitted(a.admitted_at)}d</span></div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* ── DESKTOP TABLE (md+) ── */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(248,250,252,0.8)', borderBottom: '1px solid #E2E8F0' }}>
                  {['Patient', 'Ward / Bed', 'Doctor', 'Admitted', 'Days', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-semibold" style={{ color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((a, i) => (
                  <tr key={a.id}
                    style={{ borderBottom: i < displayed.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer' }}
                    onClick={() => router.push(`/ipd/${a.id}`)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,250,252,0.7)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: '#0F172A' }}>{a.patient?.full_name ?? '—'}</p>
                      <p className="text-xs font-mono" style={{ color: '#94A3B8' }}>{a.patient?.uhid}</p>
                    </td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>
                      <p>{a.ward?.name ?? '—'}</p>
                      <p className="text-xs" style={{ color: '#94A3B8' }}>Bed {a.bed?.bed_no}</p>
                    </td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>{a.doctor?.full_name ?? '—'}</td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}><DateText date={a.admitted_at} /></td>
                    <td className="px-4 py-3">
                      <span className="font-semibold" style={{ color: '#0D9488' }}>
                        {a.status === 'admitted' ? `${daysAdmitted(a.admitted_at)}d` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status === 'admitted' ? 'active' : a.status === 'discharged' ? 'success' : 'pending'}
                        label={a.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 rounded-lg font-medium"
                        style={{ background: '#EFF6FF', color: '#1D4ED8' }}>View</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </GlassCard>

      {showAdmit && (
        <AdmitModal
          open={showAdmit}
          onClose={() => setShowAdmit(false)}
          onSuccess={(admissionId) => { setShowAdmit(false); router.push(`/ipd/${admissionId}`) }}
          doctors={doctors}
          wards={wardOptions}
          procedureTariffs={procedureTariffs}
          generalTariffPrice={generalTariffPrice}
          advancePercentage={advancePercentage}
        />
      )}
    </div>
  )
}
