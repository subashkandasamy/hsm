'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, RefreshCw, BedDouble, Stethoscope, ShieldAlert, FileWarning } from 'lucide-react'
import { listMyConsults } from '@/app/actions/careTeam'
import type { DoctorVisit } from '@/lib/types'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import DateText from '@/components/ui/DateText'
import EmptyState from '@/components/ui/EmptyState'
import { listAdmissions } from '@/app/actions/ipd'
import { getWardBoard } from '@/app/actions/wards'
import { listDeclarationsForAdmissions } from '@/app/actions/ipdDeclaration'
import AdmitModal from '../../wards/_components/AdmitModal'
import StartTreatmentModal from './StartTreatmentModal'
import UploadDeclarationModal from './UploadDeclarationModal'
import type { Admission, Ward, WardWithBeds, ProcedureTariff, IpdDeclaration } from '@/lib/types'
import { useIsReadOnly } from '@/context/ReadOnlyContext'

function daysAdmitted(admittedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(admittedAt).getTime()) / 86400000))
}

interface Props {
  initialAdmissions: Admission[]
  initialDeclarations?: Record<string, IpdDeclaration>
  wards: Ward[]
  doctors: { id: string; full_name: string }[]
  procedureTariffs?: ProcedureTariff[]
  generalTariffPrice?: number
  advancePercentage?: number
}

export default function IpdClient({ initialAdmissions, initialDeclarations = {}, wards, doctors, procedureTariffs = [], generalTariffPrice, advancePercentage = 50 }: Props) {
  const router = useRouter()
  const isReadOnly = useIsReadOnly()
  const [admissions, setAdmissions] = useState<Admission[]>(initialAdmissions)
  const [declarations, setDeclarations] = useState<Record<string, IpdDeclaration>>(initialDeclarations)
  const [statusFilter, setStatusFilter] = useState<'admitted' | 'discharged' | 'all'>('admitted')
  const [loading, setLoading] = useState(false)
  const [showAdmit, setShowAdmit] = useState(false)
  const [wardBoard, setWardBoard] = useState<WardWithBeds[]>([])
  const [startTreatmentFor, setStartTreatmentFor] = useState<Admission | null>(null)
  const [uploadDeclarationFor, setUploadDeclarationFor] = useState<Admission | null>(null)
  const [myConsults, setMyConsults] = useState<(DoctorVisit & { patient_name?: string; uhid?: string })[]>([])

  useEffect(() => { listMyConsults().then(setMyConsults) }, [])

  async function refresh(status: typeof statusFilter) {
    setLoading(true)
    const data = await listAdmissions(status === 'all' ? {} : { status })
    setAdmissions(data)
    setDeclarations(await listDeclarationsForAdmissions(data.map((a) => a.id)))
    setLoading(false)
  }

  async function openAdmitModal() {
    const board = await getWardBoard()
    setWardBoard(board)
    setShowAdmit(true)
  }

  function declStateFor(a: Admission): 'blocked' | 'pending_upload' | 'ok' {
    if (!a.treatment_started_at) return 'blocked'
    if (declarations[a.id]?.status === 'manual_pending_upload') return 'pending_upload'
    return 'ok'
  }

  // Undeclared admissions can't open the clinical detail page at all — the
  // row click redirects into the Start Treatment flow instead of navigating,
  // so staff can't land on a Clinical/Treatment/Nursing form that will only
  // fail server-side once submitted.
  function openRow(a: Admission) {
    if (a.status === 'admitted' && declStateFor(a) === 'blocked') { setStartTreatmentFor(a); return }
    router.push(`/ipd/${a.id}`)
  }

  const displayed = admissions

  const wardOptions = wardBoard.map(w => ({
    id: w.id,
    name: w.name,
    is_temp: w.is_temp,
    is_multi_bed: w.room_type_data?.is_multi_bed ?? false,
    room_type_id: w.room_type_data?.id ?? null,
    room_type_name: w.room_type_data?.name ?? null,
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
              className="p-2.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => !isReadOnly && openAdmitModal()}
              disabled={isReadOnly}
              title={isReadOnly ? 'Renew subscription to admit patients' : undefined}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1 }}
              onMouseEnter={(e) => { if (!isReadOnly) e.currentTarget.style.background = '#0F766E' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}>
              <UserPlus className="w-4 h-4" /> Admit Patient
            </button>
          </div>
        }
      />

      {/* My pending consults (specialist worklist) */}
      {myConsults.length > 0 && (
        <GlassCard className="p-4 mb-4" >
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#B45309' }}>
            My Pending Consults ({myConsults.length})
          </p>
          <div className="space-y-1.5">
            {myConsults.map((c) => (
              <button key={c.id} onClick={() => router.push(`/ipd/${c.admission_id}`)}
                className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left"
                style={{ background: '#FFFBEB', border: '1px solid #FDE68A', cursor: 'pointer' }}>
                <Stethoscope className="w-4 h-4 flex-shrink-0" style={{ color: '#B45309' }} />
                <span className="text-sm font-medium" style={{ color: '#0F172A' }}>{c.patient_name ?? '—'}</span>
                <span className="font-mono text-xs" style={{ color: '#94A3B8' }}>{c.uhid}</span>
                {c.reason && <span className="text-xs truncate" style={{ color: '#64748B' }}>· {c.reason}</span>}
                <span className="text-xs ml-auto font-semibold" style={{ color: '#B45309' }}>Open →</span>
              </button>
            ))}
          </div>
        </GlassCard>
      )}

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

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm" style={{ color: '#94A3B8' }}>Loading…</div>
      ) : displayed.length === 0 ? (
        <GlassCard>
          <EmptyState title="No admissions found"
            description={statusFilter === 'admitted' ? 'Admit a patient to get started.' : 'No records match the filter.'}
            icon={<BedDouble className="w-6 h-6" style={{ color: '#94A3B8' }} />} />
        </GlassCard>
      ) : (
        <>
          {/* ── MOBILE CARDS (< md) ── */}
          <div className="md:hidden space-y-2">
            {displayed.map((a) => {
              const days = daysAdmitted(a.admitted_at)
              const isAdmitted = a.status === 'admitted'
              const declState = declStateFor(a)
              return (
                <div key={a.id} role="button" tabIndex={0}
                  onClick={() => openRow(a)}
                  onKeyDown={(e) => { if (e.key === 'Enter') openRow(a) }}
                  className="w-full text-left rounded-2xl overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid #E2E8F0', cursor: 'pointer', display: 'block', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div className="flex items-stretch">
                    {/* Left status strip */}
                    <div className="w-1 flex-shrink-0 rounded-l-2xl"
                      style={{ background: isAdmitted ? '#0D9488' : '#94A3B8' }} />
                    <div className="flex-1 min-w-0 p-3.5">
                      {/* Name + days/status badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm leading-tight" style={{ color: '#0F172A' }}>{a.patient?.full_name ?? '—'}</p>
                          <p className="font-mono text-xs mt-0.5" style={{ color: '#94A3B8' }}>{a.patient?.uhid}</p>
                        </div>
                        {isAdmitted ? (
                          <span className="flex-shrink-0 px-2.5 py-1 rounded-xl text-xs font-bold"
                            style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}>
                            {days}d
                          </span>
                        ) : (
                          <span className="flex-shrink-0 px-2.5 py-1 rounded-xl text-xs font-semibold"
                            style={{ background: '#F1F5F9', color: '#64748B' }}>
                            discharged
                          </span>
                        )}
                      </div>
                      {/* Ward/bed + doctor chips */}
                      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                          style={{ background: 'rgba(13,148,136,0.06)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.14)' }}>
                          <BedDouble className="w-3 h-3" />
                          {a.ward?.name ?? '—'} · Bed {a.bed?.bed_no}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                          style={{ background: 'rgba(100,116,139,0.07)', color: '#475569', border: '1px solid rgba(100,116,139,0.15)' }}>
                          <Stethoscope className="w-3 h-3" />
                          {a.doctor?.full_name ?? '—'}
                        </span>
                      </div>
                      <p className="text-xs mt-1.5" style={{ color: '#94A3B8' }}>
                        Admitted <DateText date={a.admitted_at} />
                      </p>
                      {isAdmitted && declState !== 'ok' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); declState === 'blocked' ? setStartTreatmentFor(a) : setUploadDeclarationFor(a) }}
                          className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                          style={declState === 'blocked'
                            ? { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }
                            : { background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }}>
                          {declState === 'blocked'
                            ? <><ShieldAlert className="w-3.5 h-3.5" /> Start Treatment — Declaration Required</>
                            : <><FileWarning className="w-3.5 h-3.5" /> Declaration Pending Upload</>}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── DESKTOP TABLE (md+) ── */}
          <GlassCard className="hidden md:block overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(248,250,252,0.8)', borderBottom: '2px solid #E2E8F0' }}>
                  <th className="w-1 p-0" />
                  {['Patient', 'Ward / Bed', 'Doctor', 'Admitted', 'Days', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3.5 font-semibold text-xs uppercase tracking-wide" style={{ color: '#64748B' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((a, i) => {
                  const isAdmitted = a.status === 'admitted'
                  const declState = declStateFor(a)
                  return (
                    <tr key={a.id}
                      style={{ borderBottom: i < displayed.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer' }}
                      onClick={() => openRow(a)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.03)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                      {/* Colored left strip */}
                      <td className="p-0 w-1">
                        <div className="h-full w-1" style={{ background: isAdmitted ? '#0D9488' : '#CBD5E1', minHeight: 56 }} />
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold" style={{ color: '#0F172A' }}>{a.patient?.full_name ?? '—'}</p>
                        <p className="text-xs font-mono mt-0.5" style={{ color: '#94A3B8' }}>{a.patient?.uhid}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-sm" style={{ color: '#0F172A' }}>{a.ward?.name ?? '—'}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Bed {a.bed?.bed_no}</p>
                      </td>
                      <td className="px-4 py-3.5" style={{ color: '#475569' }}>{a.doctor?.full_name ?? '—'}</td>
                      <td className="px-4 py-3.5" style={{ color: '#64748B' }}><DateText date={a.admitted_at} /></td>
                      <td className="px-4 py-3.5">
                        {isAdmitted ? (
                          <span className="font-bold text-sm" style={{ color: '#0D9488' }}>{daysAdmitted(a.admitted_at)}d</span>
                        ) : (
                          <span style={{ color: '#94A3B8' }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                          style={isAdmitted
                            ? { background: '#DCFCE7', color: '#15803D' }
                            : { background: '#F1F5F9', color: '#64748B' }}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {isAdmitted && declState !== 'ok' ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); declState === 'blocked' ? setStartTreatmentFor(a) : setUploadDeclarationFor(a) }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                            style={declState === 'blocked'
                              ? { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }
                              : { background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }}>
                            {declState === 'blocked'
                              ? <><ShieldAlert className="w-3.5 h-3.5" /> Start Treatment</>
                              : <><FileWarning className="w-3.5 h-3.5" /> Upload Pending</>}
                          </button>
                        ) : (
                          <span className="text-xs px-2.5 py-1 rounded-lg font-medium"
                            style={{ background: '#EFF6FF', color: '#1D4ED8' }}>View →</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </GlassCard>
        </>
      )}

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

      {startTreatmentFor && (
        <StartTreatmentModal
          admissionId={startTreatmentFor.id}
          patientName={startTreatmentFor.patient?.full_name ?? 'Patient'}
          onClose={() => setStartTreatmentFor(null)}
          onDone={() => { setStartTreatmentFor(null); refresh(statusFilter) }}
        />
      )}

      {uploadDeclarationFor && (
        <UploadDeclarationModal
          admissionId={uploadDeclarationFor.id}
          patientId={uploadDeclarationFor.patient_id}
          patientName={uploadDeclarationFor.patient?.full_name ?? 'Patient'}
          onClose={() => setUploadDeclarationFor(null)}
          onDone={() => { setUploadDeclarationFor(null); refresh(statusFilter) }}
        />
      )}
    </div>
  )
}
