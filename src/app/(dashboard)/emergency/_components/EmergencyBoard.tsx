'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, RefreshCw, Clock, ClipboardList } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Select from '@/components/ui/Select'
import EmptyState from '@/components/ui/EmptyState'
import {
  listEmergencyCases, setTriage, attendCase,
  resolveEmergency, admitFromEmergency, getOrCreateEmergencyVisit,
} from '@/app/actions/emergency'
import { admitPatient } from '@/app/actions/ipd'
import type { EmergencyCase, TriageLevel, ProcedureTariff } from '@/lib/types'
import RegisterEmergencyModal from './RegisterEmergencyModal'
import AdmitModal from '../../wards/_components/AdmitModal'

// Triage level colors
const TRIAGE = {
  1: { bg: '#FEE2E2', border: '#FCA5A5', text: '#DC2626', label: 'Resuscitation' },
  2: { bg: '#FFEDD5', border: '#FCA5A5', text: '#C2410C', label: 'Emergent' },
  3: { bg: '#FEF3C7', border: '#FCD34D', text: '#B45309', label: 'Urgent' },
  4: { bg: '#DBEAFE', border: '#93C5FD', text: '#1D4ED8', label: 'Less Urgent' },
  5: { bg: '#DCFCE7', border: '#86EFAC', text: '#15803D', label: 'Non-Urgent' },
} as const

function waitTime(arrivedAt: string): string {
  const mins = Math.floor((Date.now() - new Date(arrivedAt).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

const STATUS_MAP: Record<string, string> = {
  waiting: 'pending', in_treatment: 'info',
  admitted: 'success', discharged: 'success', referred: 'info',
}

interface WardOption { id: string; name: string; availableBeds: { id: string; bed_no: string }[] }

interface Props {
  initialCases: EmergencyCase[]
  wardOptions: WardOption[]
  doctors: { id: string; full_name: string }[]
  admitTariffs?: ProcedureTariff[]
  admitGeneralTariffPrice?: number
  admitAdvancePercentage?: number
}

export default function EmergencyBoard({ initialCases, wardOptions, doctors, admitTariffs = [], admitGeneralTariffPrice, admitAdvancePercentage = 50 }: Props) {
  const router = useRouter()
  const [cases, setCases] = useState<EmergencyCase[]>(initialCases)
  const [loading, setLoading] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)

  // Resolve modal state
  const [resolveCase, setResolveCase] = useState<EmergencyCase | null>(null)
  const [resolveType, setResolveType] = useState<'discharge' | 'refer' | 'admit' | ''>('')
  const [outcomeNote, setOutcomeNote] = useState('')
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)

  // Admit from ER
  const [admitErCase, setAdmitErCase] = useState<EmergencyCase | null>(null)

  const [consultingId, setConsultingId] = useState<string | null>(null)

  // Attend + doctor assign modal
  const [attendCase_, setAttendCase] = useState<EmergencyCase | null>(null)
  const [selectedDoctor, setSelectedDoctor] = useState('')
  const [attending, setAttending] = useState(false)

  // Triage modal
  const [triageCase, setTriageCase] = useState<EmergencyCase | null>(null)
  const [newLevel, setNewLevel] = useState<TriageLevel>(3)

  // Auto-refresh wait times every minute
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  async function refresh() {
    setLoading(true)
    const data = await listEmergencyCases(true)
    setCases(data)
    setLoading(false)
  }

  async function handleAttend() {
    if (!attendCase_) return
    setAttending(true)
    await attendCase(attendCase_.id, selectedDoctor || undefined)
    setAttendCase(null)
    setSelectedDoctor('')
    setAttending(false)
    await refresh()
  }

  async function handleSetTriage() {
    if (!triageCase) return
    setActionId(triageCase.id)
    await setTriage(triageCase.id, newLevel)
    setTriageCase(null)
    await refresh()
    setActionId(null)
  }

  async function handleConsult(caseId: string) {
    setConsultingId(caseId)
    const r = await getOrCreateEmergencyVisit(caseId)
    if (!r.success) { setConsultingId(null); return }
    router.push(`/opd/${r.visitId}`)
  }

  async function handleResolve() {
    if (!resolveCase) return
    setResolving(true)
    setResolveError(null)

    if (resolveType === 'discharge' || resolveType === 'refer') {
      const r = await resolveEmergency(resolveCase.id, resolveType, outcomeNote)
      if (!r.success) { setResolveError(r.error); setResolving(false); return }
      setCases((c) => c.filter((ec) => ec.id !== resolveCase.id))
      setResolveCase(null)
    }
    setResolving(false)
  }

  return (
    <div>
      <PageHeader
        title="Emergency / Casualty"
        subtitle={`${cases.length} active case${cases.length !== 1 ? 's' : ''} — sorted by severity`}
        action={
          <div className="flex items-center gap-2">
            <button onClick={refresh}
              className="p-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setShowRegister(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#B91C1C' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#DC2626' }}>
              <Plus className="w-4 h-4" /> Register Emergency
            </button>
          </div>
        }
      />

      {/* Triage legend */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {([1, 2, 3, 4, 5] as TriageLevel[]).map((level) => (
          <div key={level} className="flex items-center gap-1.5 text-xs">
            <div className="w-4 h-4 rounded-md"
              style={{ background: TRIAGE[level].bg, border: `2px solid ${TRIAGE[level].border}` }} />
            <span style={{ color: '#64748B' }}>{level} — {TRIAGE[level].label}</span>
          </div>
        ))}
      </div>

      {cases.length === 0 ? (
        <GlassCard className="p-6">
          <EmptyState title="No active cases" description="Register an emergency case to get started." />
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {cases.map((ec) => {
            const t = TRIAGE[ec.triage_level as TriageLevel] ?? TRIAGE[3]
            return (
              <GlassCard key={ec.id} className="p-4">
                <div className="flex items-center gap-4">
                  {/* Triage badge */}
                  <div
                    className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 cursor-pointer"
                    style={{ background: t.bg, border: `2px solid ${t.border}` }}
                    onClick={() => { setTriageCase(ec); setNewLevel(ec.triage_level as TriageLevel) }}
                    title="Click to change triage level"
                  >
                    <span className="text-xl font-bold" style={{ color: t.text }}>{ec.triage_level}</span>
                    <span className="text-xs" style={{ color: t.text, lineHeight: 1 }}>T{ec.triage_level}</span>
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold" style={{ color: '#0F172A' }}>
                        {ec.patient?.full_name ?? '—'}
                      </p>
                      <span className="font-mono text-xs" style={{ color: '#94A3B8' }}>
                        {ec.patient?.uhid}
                      </span>
                      <StatusBadge status={STATUS_MAP[ec.status] ?? 'pending'}
                        label={ec.status.replace('_', ' ')} />
                    </div>
                    <p className="text-sm mt-0.5 truncate" style={{ color: '#475569' }}>
                      {ec.complaint ?? 'No complaint recorded'}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: '#94A3B8' }}>
                      {ec.arrival_mode && <span className="capitalize">{ec.arrival_mode.replace('_', ' ')}</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {waitTime(ec.arrived_at)} wait
                      </span>
                      {ec.attended_by && ec.attendant && (
                        <span>Attending: {ec.attendant.full_name}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                    {ec.status === 'waiting' && (
                      <button
                        onClick={() => { setAttendCase(ec); setSelectedDoctor(doctors[0]?.id ?? '') }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: '#DBEAFE', color: '#1D4ED8', border: 'none', cursor: 'pointer' }}>
                        Attend
                      </button>
                    )}
                    {ec.status === 'in_treatment' && (
                      <button
                        onClick={() => handleConsult(ec.id)}
                        disabled={consultingId === ec.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid rgba(21,128,61,0.25)', cursor: 'pointer', opacity: consultingId === ec.id ? 0.6 : 1 }}>
                        <ClipboardList className="w-3 h-3" />
                        {consultingId === ec.id ? 'Opening…' : 'Consult'}
                      </button>
                    )}
                    {(ec.status === 'waiting' || ec.status === 'in_treatment') && (
                      <>
                        <button
                          onClick={() => { setAdmitErCase(ec) }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                          Admit to IPD
                        </button>
                        <button
                          onClick={() => { setResolveCase(ec); setResolveType(''); setOutcomeNote('') }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                          Resolve
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}

      {/* Register modal */}
      <RegisterEmergencyModal
        open={showRegister}
        onClose={() => setShowRegister(false)}
        onSuccess={() => { setShowRegister(false); refresh() }}
      />

      {/* Attend — assign doctor modal */}
      <Modal open={!!attendCase_} onClose={() => setAttendCase(null)} title="Attend Case" maxWidth="24rem">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: '#475569' }}>
            Patient: <strong>{attendCase_?.patient?.full_name}</strong>
          </p>
          <FormField label="Assign Consulting Doctor">
            <Select value={selectedDoctor} onChange={(e) => setSelectedDoctor(e.target.value)}>
              <option value="">— Self (current user) —</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </Select>
          </FormField>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setAttendCase(null)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleAttend} disabled={attending}
              className="px-5 py-2 rounded-xl text-sm font-semibold"
              style={{ background: attending ? '#94A3B8' : '#1D4ED8', color: '#fff', border: 'none', cursor: attending ? 'not-allowed' : 'pointer' }}>
              {attending ? 'Attending…' : 'Confirm Attend'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Triage change modal */}
      <Modal open={!!triageCase} onClose={() => setTriageCase(null)} title="Update Triage Level" maxWidth="24rem">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: '#475569' }}>
            Patient: <strong>{triageCase?.patient?.full_name}</strong>
          </p>
          <FormField label="Triage Level">
            <Select value={newLevel} onChange={(e) => setNewLevel(Number(e.target.value) as TriageLevel)}>
              {([1, 2, 3, 4, 5] as TriageLevel[]).map((l) => (
                <option key={l} value={l}>Level {l} — {TRIAGE[l].label}</option>
              ))}
            </Select>
          </FormField>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setTriageCase(null)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
              Cancel
            </button>
            <button onClick={handleSetTriage}
              className="px-5 py-2 rounded-xl text-sm font-semibold"
              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Update Triage
            </button>
          </div>
        </div>
      </Modal>

      {/* Resolve modal */}
      <Modal open={!!resolveCase} onClose={() => setResolveCase(null)} title="Resolve Case" maxWidth="26rem">
        <div className="space-y-4">
          <FormField label="Resolution">
            <Select value={resolveType} onChange={(e) => setResolveType(e.target.value as typeof resolveType)}>
              <option value="">Select outcome…</option>
              <option value="discharge">Discharge</option>
              <option value="refer">Refer to another facility</option>
            </Select>
          </FormField>
          {resolveType && (
            <FormField label="Outcome Notes">
              <Textarea value={outcomeNote} onChange={(e) => setOutcomeNote(e.target.value)}
                placeholder="Condition at discharge, referral details…" style={{ minHeight: '4rem' }} />
            </FormField>
          )}
          {resolveError && <p className="text-sm" style={{ color: '#DC2626' }}>{resolveError}</p>}
          <div className="flex gap-3 justify-end">
            <button onClick={() => setResolveCase(null)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
              Cancel
            </button>
            <button onClick={handleResolve} disabled={resolving || !resolveType}
              className="px-5 py-2 rounded-xl text-sm font-semibold"
              style={{
                background: (resolving || !resolveType) ? '#94A3B8' : '#DC2626',
                color: '#fff', border: 'none',
                cursor: (resolving || !resolveType) ? 'not-allowed' : 'pointer',
              }}>
              {resolving ? 'Resolving…' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Admit from ER — uses shared AdmitModal, then marks ER case as admitted */}
      {admitErCase && (
        <AdmitModal
          open={true}
          onClose={() => setAdmitErCase(null)}
          onSuccess={async (admissionId) => {
            await admitFromEmergency(admitErCase.id)
            setAdmitErCase(null)
            router.push(`/ipd/${admissionId}`)
          }}
          doctors={doctors}
          wards={wardOptions}
          procedureTariffs={admitTariffs}
          generalTariffPrice={admitGeneralTariffPrice}
          advancePercentage={admitAdvancePercentage}
          preselectedPatient={admitErCase.patient ? {
            id: admitErCase.patient.id,
            full_name: admitErCase.patient.full_name,
            uhid: admitErCase.patient.uhid,
          } : undefined}
        />
      )}
    </div>
  )
}
