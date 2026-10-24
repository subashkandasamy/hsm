'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, RefreshCw, Clock, ClipboardList, Printer, IndianRupee, Gavel, Send, Pencil } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import EmptyState from '@/components/ui/EmptyState'
import {
  listEmergencyCases, listRecentEmergencyCases, setTriage, attendCase,
  resolveEmergency, admitFromEmergency, getOrCreateEmergencyVisit, getExistingEmergencyVisit,
} from '@/app/actions/emergency'
import ErChargesModal from './ErChargesModal'
import MlcPendingPanel from './MlcPendingPanel'
import ReferPatientModal from '@/components/clinical/ReferPatientModal'
import { listCaseReferrals } from '@/app/actions/referOut'
import { setCaseMlc, type MlcPendingRow } from '@/app/actions/mlc'
import { admitPatient, hasActiveAdmission } from '@/app/actions/ipd'
import type { EmergencyCase, TriageLevel, ProcedureTariff } from '@/lib/types'
import RegisterEmergencyModal from './RegisterEmergencyModal'
import AdmitModal from '../../wards/_components/AdmitModal'
import { useIsReadOnly } from '@/context/ReadOnlyContext'

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

interface WardOption { id: string; name: string; is_temp: boolean; is_multi_bed: boolean; room_type_id: string | null; room_type_name: string | null; availableBeds: { id: string; bed_no: string }[] }

interface Props {
  initialCases: EmergencyCase[]
  wardOptions: WardOption[]
  doctors: { id: string; full_name: string }[]
  admitTariffs?: ProcedureTariff[]
  admitGeneralTariffPrice?: number
  admitAdvancePercentage?: number
  erTariffs?: ProcedureTariff[]
  initialRecent?: EmergencyCase[]
  /** Medico-legal cases with the police uninformed or the register unsigned. */
  initialMlcPending?: MlcPendingRow[]
}

export default function EmergencyBoard({ initialCases, wardOptions, doctors, admitTariffs = [], admitGeneralTariffPrice, admitAdvancePercentage = 50, erTariffs = [], initialRecent = [], initialMlcPending = [] }: Props) {
  const router = useRouter()
  const isReadOnly = useIsReadOnly()
  const [cases, setCases] = useState<EmergencyCase[]>(initialCases)
  const [view, setView] = useState<'active' | 'recent'>('active')
  const [recent, setRecent] = useState<EmergencyCase[]>(initialRecent)
  const [chargesCase, setChargesCase] = useState<EmergencyCase | null>(null)
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
  const [admitErVisitId, setAdmitErVisitId] = useState<string | null>(null)
  const [admitBlockMsg, setAdmitBlockMsg] = useState<string | null>(null)
  const [openingAdmitId, setOpeningAdmitId] = useState<string | null>(null)

  // Open the shared admit flow for an ER case, pre-resolving its existing
  // emergency visit (if the patient was consulted) so the admission links back
  // to it for the doctor's lab/radiology reports. Never creates a visit.
  // Blocks up-front if the patient is already admitted — an inpatient can't be
  // admitted again from Emergency.
  async function openAdmit(ec: EmergencyCase) {
    if (!ec.patient?.id) { setAdmitErCase(ec); return }
    setOpeningAdmitId(ec.id)
    if (await hasActiveAdmission(ec.patient.id)) {
      setOpeningAdmitId(null)
      setAdmitBlockMsg(`${ec.patient.full_name} is already admitted in IPD. Discharge the existing admission before admitting again from Emergency.`)
      return
    }
    setAdmitErCase(ec)
    setAdmitErVisitId(await getExistingEmergencyVisit(ec.id))
    setOpeningAdmitId(null)
  }

  const [consultingId, setConsultingId] = useState<string | null>(null)

  // Marking a case medico-legal after the fact. The commonest route in
  // practice: the desk records "fall at home", and the doctor examining the
  // patient does not believe it. The duty starts at that moment, not at
  // registration, so the board has to let it be said late.
  const [referCase, setReferCase] = useState<EmergencyCase | null>(null)
  const [editReferral, setEditReferral] = useState<string | null>(null)
  const [mlcKey, setMlcKey] = useState(0)
  // Which cases already have a referral letter, so the card can offer a
  // reprint. Keyed by case id.
  const [caseReferrals, setCaseReferrals] = useState<Record<string, { id: string; ref_no: string }>>({})
  const [mlcFlagId, setMlcFlagId] = useState<string | null>(null)
  async function flagMlc(ec: EmergencyCase) {
    setMlcFlagId(ec.id)
    await setCaseMlc(ec.id, true)
    setMlcFlagId(null)
    refresh()
    router.refresh()
  }

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
    const [data, closed] = await Promise.all([listEmergencyCases(true), listRecentEmergencyCases(7)])
    setCases(data)
    setRecent(closed)
    // The outstanding panel reads its own list; tell it to look again. A case
    // registered as medico-legal must appear there in the same breath as it
    // appears on the board.
    setMlcKey((n) => n + 1)
    setCaseReferrals(await listCaseReferrals([...data, ...closed].map((c) => c.id)))
    setLoading(false)
  }

  // On first paint too — a letter written yesterday must be reprintable today
  // without touching anything first.
  useEffect(() => {
    let live = true
    void (async () => {
      const m = await listCaseReferrals([...cases, ...recent].map((c) => c.id))
      if (live) setCaseReferrals(m)
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const [printNote, setPrintNote] = useState(true)

  async function handleResolve() {
    if (!resolveCase) return
    setResolving(true)
    setResolveError(null)

    if (resolveType === 'discharge' || resolveType === 'refer') {
      // Open the tab before any await so popup blockers allow it; it shows the
      // discharge / referral note once the case is resolved.
      const tab = printNote ? window.open('about:blank', '_blank') : null
      const r = await resolveEmergency(resolveCase.id, resolveType, outcomeNote)
      if (!r.success) { tab?.close(); setResolveError(r.error); setResolving(false); return }
      if (tab) tab.location.href = `/print/emergency/${resolveCase.id}/pdf`
      setCases((c) => c.filter((ec) => ec.id !== resolveCase.id))
      setRecent((r) => [{ ...resolveCase, status: resolveType === 'refer' ? 'referred' : 'discharged', outcome: outcomeNote }, ...r])
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
            <button onClick={() => !isReadOnly && setShowRegister(true)}
              disabled={isReadOnly}
              title={isReadOnly ? 'Renew subscription to register emergency cases' : undefined}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#DC2626', color: '#fff', border: 'none', cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1 }}
              onMouseEnter={(e) => { if (!isReadOnly) e.currentTarget.style.background = '#B91C1C' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#DC2626' }}>
              <Plus className="w-4 h-4" /> Register Emergency
            </button>
          </div>
        }
      />

      {/*
        What the hospital still owes on its medico-legal cases. Renders nothing
        when there is nothing outstanding, and sits above the board because
        these duties are the only time-bound ones on this screen.
      */}
      <MlcPendingPanel initial={initialMlcPending} refreshKey={mlcKey} />

      {/* Triage legend */}
      <div className="flex items-center gap-x-3 gap-y-1.5 mb-5 flex-wrap">
        {([1, 2, 3, 4, 5] as TriageLevel[]).map((level) => (
          <div key={level} className="flex items-center gap-1.5 text-xs whitespace-nowrap">
            <div className="w-3.5 h-3.5 rounded flex-shrink-0"
              style={{ background: TRIAGE[level].bg, border: `2px solid ${TRIAGE[level].border}` }} />
            <span style={{ color: '#64748B' }}>{level} — {TRIAGE[level].label}</span>
          </div>
        ))}
      </div>

      {/* Active board / recently closed cases (reprint discharge & referral notes) */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl" role="tablist" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid #E2E8F0', width: 'fit-content' }}>
        {([['active', `Active (${cases.length})`], ['recent', `Closed — last 7 days (${recent.length})`]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: view === k ? '#fff' : 'transparent', color: view === k ? '#0F172A' : '#64748B', border: 'none', cursor: 'pointer', boxShadow: view === k ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>
            {label}
          </button>
        ))}
      </div>

      {view === 'recent' ? (
        recent.length === 0 ? (
          <GlassCard className="p-6">
            <EmptyState title="No closed cases" description="Discharged, referred and admitted cases from the last 7 days appear here." />
          </GlassCard>
        ) : (
          <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
            {recent.map((ec) => (
              <div key={ec.id} className="flex items-center gap-3 px-4 py-3 flex-wrap" style={{ borderBottom: '1px solid #F1F5F9' }}>
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: (TRIAGE[ec.triage_level as TriageLevel] ?? TRIAGE[3]).bg, color: (TRIAGE[ec.triage_level as TriageLevel] ?? TRIAGE[3]).text }}>T{ec.triage_level}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{ec.patient?.full_name ?? '—'} <span className="font-mono text-xs font-normal" style={{ color: '#94A3B8' }}>{ec.patient?.uhid}</span></p>
                  <p className="text-xs truncate" style={{ color: '#64748B' }}>
                    {new Date(ec.arrived_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                    {ec.complaint ? ` · ${ec.complaint}` : ''}{ec.outcome ? ` · ${ec.outcome}` : ''}
                  </p>
                </div>
                <StatusBadge status={STATUS_MAP[ec.status] ?? 'pending'} label={ec.status} />
                <a href={`/print/emergency/${ec.id}/pdf`} target="_blank" rel="noopener"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0' }}>
                  <Printer className="w-3 h-3" /> {ec.status === 'referred' ? 'Referral note' : ec.status === 'discharged' ? 'Discharge note' : 'Case sheet'}
                </a>
                {caseReferrals[ec.id] && (
                  <a href={`/print/referral/${caseReferrals[ec.id].id}`} target="_blank" rel="noopener"
                    title={caseReferrals[ec.id].ref_no}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: '#F0FDFA', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)' }}>
                    <Printer className="w-3 h-3" /> Referral letter
                  </a>
                )}
                <button onClick={() => setChargesCase(ec)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                  <IndianRupee className="w-3 h-3" /> Charges
                </button>
              </div>
            ))}
          </GlassCard>
        )
      ) : cases.length === 0 ? (
        <GlassCard className="p-6">
          <EmptyState title="No active cases" description="Register an emergency case to get started." />
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {cases.map((ec) => {
            const t = TRIAGE[ec.triage_level as TriageLevel] ?? TRIAGE[3]
            return (
              <GlassCard key={ec.id} style={{ padding: 0, overflow: 'hidden' }}>
                {/* Triage colour strip + content */}
                <div className="flex items-stretch">
                  {/* Left severity strip — click to change triage */}
                  <button
                    onClick={() => { setTriageCase(ec); setNewLevel(ec.triage_level as TriageLevel) }}
                    title="Change triage level"
                    className="flex flex-col items-center justify-center gap-0.5 flex-shrink-0"
                    style={{ width: 48, background: t.bg, border: 'none', borderRight: `3px solid ${t.border}`, cursor: 'pointer', padding: '12px 0' }}>
                    <span className="text-2xl font-black leading-none" style={{ color: t.text }}>{ec.triage_level}</span>
                    <span className="text-xs font-bold" style={{ color: t.text, letterSpacing: '0.05em' }}>T{ec.triage_level}</span>
                  </button>

                  {/* Main content */}
                  <div className="flex-1 min-w-0 p-3">
                    {/* Name + UHID on first line */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm" style={{ color: '#0F172A' }}>
                        {ec.patient?.full_name ?? '—'}
                      </p>
                      <span className="font-mono text-xs whitespace-nowrap" style={{ color: '#94A3B8' }}>
                        {ec.patient?.uhid}
                      </span>
                    </div>
                    {/* Status badge on second line to avoid inline crowding */}
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <StatusBadge status={STATUS_MAP[ec.status] ?? 'pending'}
                        label={ec.status.replace('_', ' ')} />
                      {/*
                        Marked on the card itself, not only in the panel above:
                        whoever picks this case up next needs to know it is
                        medico-legal before they touch the patient, because it
                        changes what they must record and preserve.
                      */}
                      {ec.is_mlc && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(220,38,38,0.08)', color: '#B91C1C', border: '1px solid #FECACA' }}>
                          <Gavel className="w-3 h-3" /> Medico-legal
                        </span>
                      )}
                    </div>

                    {/* Complaint */}
                    <p className="text-xs mt-1" style={{ color: '#475569' }}>
                      {ec.complaint ?? <span style={{ color: '#CBD5E1', fontStyle: 'italic' }}>No complaint recorded</span>}
                    </p>

                    {/* Meta */}
                    <div className="flex items-center gap-x-2 gap-y-0.5 mt-1 flex-wrap text-xs" style={{ color: '#94A3B8' }}>
                      {ec.arrival_mode && (
                        <span className="capitalize whitespace-nowrap">{ec.arrival_mode.replace('_', ' ')}</span>
                      )}
                      <span className="flex items-center gap-0.5 whitespace-nowrap">
                        <Clock className="w-3 h-3" /> {waitTime(ec.arrived_at)} wait
                      </span>
                      {ec.attended_by && ec.attendant && (
                        <span className="whitespace-nowrap" style={{ color: '#0D9488' }}>
                          👨‍⚕️ {ec.attendant.full_name}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    {(ec.status === 'waiting' || ec.status === 'in_treatment') && (
                      <div className="flex items-center gap-2 mt-2.5 flex-wrap" style={{ borderTop: '1px solid #F1F5F9', paddingTop: '0.5rem' }}>
                        {ec.status === 'waiting' && (
                          <button
                            onClick={() => { setAttendCase(ec); setSelectedDoctor(doctors[0]?.id ?? '') }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                            style={{ background: '#DBEAFE', color: '#1D4ED8', border: 'none', cursor: 'pointer' }}>
                            Attend
                          </button>
                        )}
                        {ec.status === 'in_treatment' && (
                          <button
                            onClick={() => handleConsult(ec.id)}
                            disabled={consultingId === ec.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
                            style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid rgba(21,128,61,0.25)', cursor: 'pointer', opacity: consultingId === ec.id ? 0.6 : 1 }}>
                            <ClipboardList className="w-3 h-3" />
                            {consultingId === ec.id ? 'Opening…' : 'Consult'}
                          </button>
                        )}
                        <button
                          onClick={() => openAdmit(ec)}
                          disabled={openingAdmitId === ec.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: openingAdmitId === ec.id ? 'not-allowed' : 'pointer', opacity: openingAdmitId === ec.id ? 0.6 : 1 }}>
                          {openingAdmitId === ec.id ? 'Checking…' : 'Admit to IPD'}
                        </button>
                        {/*
                          A casualty refers more patients than any other
                          department, and almost always in a hurry. Raising the
                          letter is separate from resolving the case, because the
                          letter has to be written before the patient leaves and
                          the case is often resolved afterwards.
                        */}
                        <button onClick={() => { setEditReferral(null); setReferCase(ec) }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: '#F0FDFA', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)', cursor: 'pointer' }}>
                          <Send className="w-3 h-3" /> Refer out
                        </button>
                        {!ec.is_mlc && (
                          <button onClick={() => flagMlc(ec)} disabled={mlcFlagId === ec.id}
                            title="Accident, assault, burns, poisoning, self-harm, or injuries that do not match the history"
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                            style={{ background: '#fff', color: '#B91C1C', border: '1px solid #FECACA', cursor: 'pointer' }}>
                            <Gavel className="w-3 h-3" />
                            {mlcFlagId === ec.id ? 'Marking…' : 'Medico-legal'}
                          </button>
                        )}
                        <button onClick={() => setChargesCase(ec)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium ml-auto"
                          style={{ background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                          <IndianRupee className="w-3 h-3" /> Charges
                        </button>
                        <a href={`/print/emergency/${ec.id}/pdf`} target="_blank" rel="noopener"
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0' }}>
                          <Printer className="w-3 h-3" /> Case sheet
                        </a>
                        {caseReferrals[ec.id] && (
                          <>
                            <a href={`/print/referral/${caseReferrals[ec.id].id}`} target="_blank" rel="noopener"
                              title={caseReferrals[ec.id].ref_no}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ background: '#F0FDFA', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)' }}>
                              <Printer className="w-3 h-3" /> Referral letter
                            </a>
                            {/* Correcting it keeps its number, rather than
                                issuing a second letter for the same journey. */}
                            <button
                              onClick={() => { setEditReferral(caseReferrals[ec.id].id); setReferCase(ec) }}
                              title={`Correct ${caseReferrals[ec.id].ref_no}`}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => { setResolveCase(ec); setResolveType(''); setOutcomeNote('') }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                          Resolve
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}

      {referCase?.patient?.id && (
        <ReferPatientModal
          open={!!referCase} onClose={() => { setReferCase(null); setEditReferral(null) }}
          /*
            Refresh the board, but do NOT close the modal. Closing it here
            unmounted the confirmation step, so a letter written from casualty
            was saved and then vanished with no chance to print it — the one
            screen where the paper has to leave with the patient. The modal
            closes when the user takes the print, or says Later.
          */
          onSaved={() => refresh()}
          patientId={referCase.patient.id}
          emergencyCaseId={referCase.id} source="emergency"
          referralId={editReferral} />
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

      {chargesCase && (
        <ErChargesModal ec={chargesCase} erTariffs={erTariffs}
          readOnly={isReadOnly || !['waiting', 'in_treatment'].includes(chargesCase.status)}
          onClose={() => setChargesCase(null)} />
      )}

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
          {resolveType && (
            <label className="flex items-center gap-2 text-sm" style={{ color: '#475569' }}>
              <input type="checkbox" checked={printNote} onChange={(e) => setPrintNote(e.target.checked)} />
              Print {resolveType === 'refer' ? 'referral' : 'discharge'} note
            </label>
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

      {/* Already-admitted block — an inpatient can't be re-admitted from ER */}
      {admitBlockMsg && (
        <Modal open onClose={() => setAdmitBlockMsg(null)} title="Already admitted" maxWidth="26rem">
          <div className="space-y-4">
            <p className="text-sm" style={{ color: '#475569' }}>{admitBlockMsg}</p>
            <div className="flex justify-end">
              <button onClick={() => setAdmitBlockMsg(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                OK
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Admit from ER — uses shared AdmitModal, then marks ER case as admitted */}
      {admitErCase && (
        <AdmitModal
          open={true}
          onClose={() => { setAdmitErCase(null); setAdmitErVisitId(null) }}
          onSuccess={async (admissionId) => {
            await admitFromEmergency(admitErCase.id)
            setAdmitErCase(null)
            setAdmitErVisitId(null)
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
          sourceVisitId={admitErVisitId}
          emergencyCaseId={admitErCase.id}
        />
      )}
    </div>
  )
}
