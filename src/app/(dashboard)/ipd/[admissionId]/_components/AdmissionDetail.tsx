'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, User, BedDouble, Calendar, Clock, FileText,
  Plus, ArrowRightLeft, LogOut, Receipt, Printer, Send,
  Pill, IndianRupee, Stethoscope, ChevronDown, ChevronUp, Scissors, Activity, Droplets, Baby,
} from 'lucide-react'
import Link from 'next/link'
import GlassCard from '@/components/ui/GlassCard'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import SpeechTextarea from '@/components/ui/SpeechTextarea'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import Modal from '@/components/ui/Modal'
import ReferPatientModal from '@/components/clinical/ReferPatientModal'
import ReferralsOutCard from '@/components/clinical/ReferralsOutCard'
import Money from '@/components/ui/Money'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import { addProgressNote, transferBed, updateDischargeSummary } from '@/app/actions/ipd'
import { dischargeTypeLabel } from '@/lib/dischargeType'
import DischargeModal, { type DischargeDone } from './DischargeModal'
import ScheduleModal from '@/app/(dashboard)/ot/_components/ScheduleModal'
import BillBuilderModal from '@/app/(dashboard)/billing/_components/BillBuilderModal'
import RaiseRequestModal from '@/app/(dashboard)/blood/_components/RaiseRequestModal'
import WristbandLabelModal from '@/components/barcode/WristbandLabelModal'
import TreatmentPanel from './TreatmentPanel'
import CareTeamPanel from './CareTeamPanel'
import CriticalCarePanel from './CriticalCarePanel'
import NursingDocsPanel from './NursingDocsPanel'
import FollowUpCard from '@/app/(dashboard)/opd/[visitId]/_components/FollowUpCard'
import NursingPanel from './NursingPanel'
import LabourDeliveryPanel from './LabourDeliveryPanel'
import type { LabourContext } from '@/app/actions/labour'

import type {
  Admission, IpdProgressNote, Vitals,
  AdvanceDepositRequest, AdmissionNurseAssignment,
  OtSchedule, Profile, ProcedureTariff,
} from '@/lib/types'

function daysAdmitted(admittedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(admittedAt).getTime()) / 86400000))
}

interface WardOption {
  id: string
  name: string
  availableBeds: { id: string; bed_no: string }[]
}

interface NurseOption { id: string; full_name: string; nursing_charge_per_shift: number | null }

interface Props {
  admission: Admission
  initialNotes: IpdProgressNote[]
  availableWards: WardOption[]
  nurses: NurseOption[]
  today: string
  depositStatus: AdvanceDepositRequest | null
  todayAssignments: AdmissionNurseAssignment[]
  otDoctors: Pick<Profile, 'id' | 'full_name' | 'role'>[]
  otTariffs: ProcedureTariff[]
  initialOtSchedules: OtSchedule[]
  labourContext?: LabourContext | null
}

const OT_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  scheduled:   { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  in_progress: { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' },
  completed:   { bg: '#DCFCE7', text: '#15803D', border: '#BBF7D0' },
  cancelled:   { bg: '#F1F5F9', text: '#94A3B8', border: '#E2E8F0' },
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AdmissionDetail({
  admission, initialNotes, availableWards,
  nurses, today, depositStatus, todayAssignments,
  otDoctors, otTariffs, initialOtSchedules, labourContext = null,
}: Props) {
  const router = useRouter()
  const { profile } = useAuth()
  const canWrite        = profile && hasPermission(profile.role, 'ipd:write', profile.granted_permissions)
  const canNote         = profile && hasPermission(profile.role, 'ipd:notes', profile.granted_permissions)
  const canNursing      = profile && hasPermission(profile.role, 'ipd:nursing', profile.granted_permissions)
  const canPrintWristband = profile && hasPermission(profile.role, 'barcode:print:patient', profile.granted_permissions)
  const canRequestBlood = profile && hasPermission(profile.role, 'bloodbank:request', profile.granted_permissions)

  const [notes, setNotes] = useState<IpdProgressNote[]>(initialNotes)
  const [adm, setAdm] = useState(admission)
  const [activeTab, setActiveTab] = useState<'clinical' | 'treatment' | 'nursing' | 'critical' | 'labour'>('clinical')

  // Progress note form
  const [note, setNote] = useState('')
  const [vitals, setVitals] = useState<Vitals>({})
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  // OT Schedules
  const [otSchedules, setOtSchedules] = useState<OtSchedule[]>(initialOtSchedules)
  const [showScheduleOt, setShowScheduleOt] = useState(false)

  // Transfer
  const [showWristband, setShowWristband] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showRefer, setShowRefer] = useState(false)
  const [referralsKey, setReferralsKey] = useState(0)
  const [editReferral, setEditReferral] = useState<string | null>(null)
  const [showBloodRequest, setShowBloodRequest] = useState(false)
  const [transferWardId, setTransferWardId] = useState('')
  const [transferBedId, setTransferBedId] = useState('')
  const [transferBeds, setTransferBeds] = useState<{ id: string; bed_no: string }[]>([])
  const [transferring, setTransferring] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)

  // Discharge
  const [showDischarge, setShowDischarge] = useState(false)
  const [dueRecorded, setDueRecorded] = useState(0)
  const [showBillingPrompt, setShowBillingPrompt] = useState(false)
  const [showBillBuilder, setShowBillBuilder] = useState(false)

  // Edit discharge summary after discharge
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [editingSummary, setEditingSummary] = useState(false)
  const [editedSummary, setEditedSummary] = useState(adm.discharge_summary ?? '')
  const [summaryUpdating, setSummaryUpdating] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  // Speech-to-text

  async function handleUpdateSummary() {
    setSummaryUpdating(true)
    setSummaryError(null)
    const result = await updateDischargeSummary(adm.id, editedSummary)
    setSummaryUpdating(false)
    if (result.success) {
      setAdm((a) => ({ ...a, discharge_summary: editedSummary }))
      setEditingSummary(false)
    } else {
      setSummaryError(result.error)
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setNoteSaving(true)
    setNoteError(null)
    const vitalsPayload: Vitals = Object.fromEntries(
      Object.entries(vitals).filter(([, v]) => v)
    ) as Vitals
    const result = await addProgressNote(adm.id, {
      note,
      vitals: Object.keys(vitalsPayload).length ? vitalsPayload : undefined,
    })
    setNoteSaving(false)
    if (!result.success) { setNoteError(result.error); return }
    setNotes((n) => [{
      id: crypto.randomUUID(),
      admission_id: adm.id,
      author_id: profile?.id ?? null,
      note,
      vitals: Object.keys(vitalsPayload).length ? vitalsPayload : null,
      created_at: new Date().toISOString(),
      author: profile ? { id: profile.id, full_name: profile.full_name, role: profile.role } : undefined,
    }, ...n])
    setNote('')
    setVitals({})
  }

  async function handleTransfer() {
    if (!transferBedId) { setTransferError('Select a target bed'); return }
    setTransferring(true)
    setTransferError(null)
    const result = await transferBed(adm.id, transferBedId)
    setTransferring(false)
    if (!result.success) { setTransferError(result.error); return }
    setShowTransfer(false)
    router.refresh()
  }

  function handleDischarged(d: DischargeDone) {
    setAdm((a) => ({
      ...a, status: 'discharged', discharged_at: d.dischargedAt, discharge_summary: d.summary,
      discharge_type: d.type, death_at: d.deathAt, death_cause: d.deathCause,
    }))
    setDueRecorded(d.dueRecorded)
    setShowDischarge(false)
    setShowBillingPrompt(true)
  }

  const isClosed = adm.status !== 'admitted'
  const days = daysAdmitted(adm.admitted_at)

  // Advance deposit chip props
  const depositPending = depositStatus?.status === 'pending'
  const depositCollected = depositStatus?.status === 'collected'

  return (
    <div>
      <Link href="/ipd" className="inline-flex items-center gap-1.5 text-sm mb-4"
        style={{ color: '#64748B' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#0D9488' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B' }}>
        <ArrowLeft className="w-4 h-4" /> Back to IPD
      </Link>

      {/* Header card */}
      <GlassCard className="p-5 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)' }}>
              <User className="w-6 h-6" style={{ color: '#0D9488' }} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/patients/${adm.patient_id}`} className="text-lg font-bold hover:underline"
                  style={{ color: '#0F172A' }}>
                  {adm.patient?.full_name ?? '—'}
                </Link>
                <span className="font-mono text-xs px-2 py-0.5 rounded-lg"
                  style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>
                  {adm.patient?.uhid}
                </span>
                {adm.ip_no && (
                  <span className="font-mono text-xs px-2 py-0.5 rounded-lg" title="Inpatient (admission) number"
                    style={{ background: '#F1F5F9', color: '#475569' }}>
                    {adm.ip_no}
                  </span>
                )}
                <StatusBadge
                  status={adm.status === 'admitted' ? 'active' : adm.status === 'discharged' ? 'success' : 'pending'}
                  label={adm.status}
                />

                {/* Advance deposit chip — read-only glance status */}
                {depositPending && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold"
                    style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                    <IndianRupee className="w-3 h-3" />
                    Advance: Pending{' '}
                    <Money amount={depositStatus!.amount} style={{ color: '#92400E', fontSize: 'inherit' }} />
                  </span>
                )}
                {depositCollected && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold"
                    style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0' }}>
                    <IndianRupee className="w-3 h-3" />
                    Advance: Paid
                  </span>
                )}
              </div>

              <div className="flex items-center gap-x-4 gap-y-1 mt-1.5 text-sm flex-wrap" style={{ color: '#475569' }}>
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <BedDouble className="w-3.5 h-3.5 flex-shrink-0" />
                  {adm.ward?.name} — Bed {adm.bed?.bed_no}
                </span>
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                  Admitted <DateText date={adm.admitted_at} />
                </span>
                {adm.source_visit_id ? (
                  <Link href={`/opd/${adm.source_visit_id}`}
                    className="flex items-center gap-1 whitespace-nowrap font-medium hover:underline"
                    style={{ color: '#0D9488' }}
                    title={`Open the ${adm.source_emergency_case_id ? 'Emergency' : 'OPD'} consultation this admission came from — view its lab & radiology reports`}>
                    {adm.source_emergency_case_id
                      ? <Activity className="w-3.5 h-3.5 flex-shrink-0" />
                      : <Stethoscope className="w-3.5 h-3.5 flex-shrink-0" />}
                    From {adm.source_emergency_case_id ? 'ER' : 'OPD'} visit
                  </Link>
                ) : adm.source_emergency_case_id ? (
                  <span className="flex items-center gap-1 whitespace-nowrap font-medium"
                    style={{ color: '#DC2626' }}
                    title="This admission was admitted directly from the Emergency department">
                    <Activity className="w-3.5 h-3.5 flex-shrink-0" />
                    From Emergency
                  </span>
                ) : null}
                {adm.status === 'admitted' && (
                  <span className="flex items-center gap-1 font-semibold whitespace-nowrap" style={{ color: '#0D9488' }}>
                    <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                    Day {days}
                  </span>
                )}
                {adm.status === 'discharged' && adm.discharged_at && (
                  <span className="flex items-center gap-1 whitespace-nowrap"
                    style={adm.discharge_type && adm.discharge_type !== 'normal' ? { color: '#334155', fontWeight: 600 } : undefined}>
                    <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
                    {dischargeTypeLabel(adm.discharge_type)} <DateText date={adm.discharge_type === 'death' && adm.death_at ? adm.death_at : adm.discharged_at} />
                  </span>
                )}
              </div>
              {adm.reason && (
                <p className="text-sm mt-1" style={{ color: '#64748B' }}>
                  <span className="font-medium">Reason:</span> {adm.reason}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap" style={{ minWidth: 0 }}>
            <button
              onClick={() => window.open(`/print/ipd/${adm.id}`, '_blank')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)', cursor: 'pointer' }}>
              <Printer className="w-4 h-4" /> Print
            </button>
            {adm.discharge_summary && (
              <button
                onClick={() => window.open(`/print/ipd/${adm.id}/discharge/pdf`, '_blank')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(21,128,61,0.08)', color: '#15803D', border: '1px solid rgba(21,128,61,0.25)', cursor: 'pointer' }}>
                <Printer className="w-4 h-4" /> {adm.discharge_type === 'death' ? 'Death Summary' : 'Discharge Summary'}
              </button>
            )}
            {!isClosed && canWrite && (
              <>
                {canPrintWristband && (
                  <button onClick={() => setShowWristband(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
                    style={{ background: 'rgba(124,58,237,0.08)', color: '#7C3AED', border: '1px solid rgba(124,58,237,0.2)', cursor: 'pointer' }}>
                    <Printer className="w-4 h-4" /> Wristband
                  </button>
                )}
                <button onClick={() => setShowScheduleOt(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
                  style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)', cursor: 'pointer' }}>
                  <Scissors className="w-4 h-4" /> Schedule Surgery
                </button>
                <button onClick={() => setShowTransfer(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
                  style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)', cursor: 'pointer' }}>
                  <ArrowRightLeft className="w-4 h-4" /> Transfer
                </button>
                {/*
                  Beside Transfer, because they are the same decision pointed
                  at two different places: Transfer moves the patient to
                  another ward here, Refer sends them to another hospital. A
                  referred inpatient is the case that matters most — they leave
                  with the letter in hand, and everything the receiving doctor
                  knows comes from it.
                */}
                <button onClick={() => { setEditReferral(null); setShowRefer(true) }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
                  style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)', cursor: 'pointer' }}>
                  <Send className="w-4 h-4" /> Refer Out
                </button>
                {canRequestBlood && (
                  <button onClick={() => setShowBloodRequest(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
                    style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.2)', cursor: 'pointer' }}>
                    <Droplets className="w-4 h-4" /> Request Blood
                  </button>
                )}
                <button onClick={() => setShowDischarge(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#B91C1C' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#DC2626' }}>
                  <LogOut className="w-4 h-4" /> Discharge
                </button>
              </>
            )}
          </div>
        </div>

        {adm.status === 'discharged' && (
          <div className="mt-4 rounded-xl text-sm overflow-hidden"
            style={{ border: '1px solid #BBF7D0' }}>
            {/* Collapsible header */}
            <button
              onClick={() => { if (editingSummary) return; setSummaryExpanded(e => !e) }}
              className="w-full flex items-center justify-between px-3 py-2.5"
              style={{ background: '#F0FDF4', cursor: 'pointer', border: 'none', textAlign: 'left' }}>
              <span className="font-semibold" style={{ color: '#15803D' }}>Discharge Summary</span>
              <div className="flex items-center gap-2">
                {canWrite && !editingSummary && summaryExpanded && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); setEditedSummary(adm.discharge_summary ?? ''); setEditingSummary(true); setSummaryExpanded(true) }}
                    className="text-xs px-2 py-0.5 rounded-lg font-medium"
                    style={{ background: '#fff', color: '#0D9488', border: '1px solid #0D9488', cursor: 'pointer' }}>
                    Edit
                  </span>
                )}
                {summaryExpanded
                  ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: '#15803D' }} />
                  : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#15803D' }} />
                }
              </div>
            </button>

            {/* Expandable body */}
            {summaryExpanded && (
              <div className="px-3 py-3" style={{ background: '#F0FDF4', borderTop: '1px solid #BBF7D0' }}>
                {editingSummary ? (
                  <div>
                    <SpeechTextarea
                      fieldKey="ipd.discharge_summary"
                      value={editedSummary}
                      onChange={setEditedSummary}
                      rows={6}
                      className="w-full text-sm rounded-lg p-2 border"
                      style={{ borderColor: '#BBF7D0', color: '#0F172A', resize: 'vertical', fontFamily: 'inherit' }}
                    />
                    {summaryError && <p className="text-xs mt-1" style={{ color: '#DC2626' }}>{summaryError}</p>}
                    <div className="flex gap-2 mt-2">
                      <button onClick={handleUpdateSummary} disabled={summaryUpdating}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                        style={{ background: '#15803D', color: '#fff', cursor: summaryUpdating ? 'not-allowed' : 'pointer', opacity: summaryUpdating ? 0.6 : 1 }}>
                        {summaryUpdating ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingSummary(false)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p style={{ whiteSpace: 'pre-wrap', color: '#15803D' }}>
                    {adm.discharge_summary || <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>No summary recorded</span>}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* Post-discharge billing prompt */}
      {showBillingPrompt && (
        <div className="rounded-xl p-4 mb-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
          <div className="flex items-center gap-3">
            <Receipt className="w-5 h-5 flex-shrink-0" style={{ color: '#15803D' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#15803D' }}>
                {adm.discharge_type === 'death' ? 'Death recorded and patient discharged' : 'Patient discharged'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#16A34A' }}>
                {dueRecorded > 0 && <>₹{dueRecorded.toLocaleString('en-IN', { maximumFractionDigits: 2 })} stays due on the bills. </>}
                This admission may have unbilled charges. Generate a bill now?
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => setShowBillBuilder(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
              style={{ background: '#15803D', color: '#fff', border: 'none' }}>
              <Receipt className="w-4 h-4" /> Generate Bill
            </button>
            <button onClick={() => setShowBillingPrompt(false)}
              className="px-3 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
              Later
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="overflow-x-auto -mx-4 px-4 mb-4">
        <div className="flex gap-1 p-1 rounded-xl w-max"
          style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid #E2E8F0' }}>
        {([
          { key: 'clinical',   label: 'Clinical',   Icon: FileText    },
          { key: 'treatment',  label: 'Treatment',  Icon: Pill        },
          { key: 'critical',   label: 'Critical Care', Icon: Activity },
          { key: 'nursing',    label: 'Nursing',    Icon: Stethoscope },
          ...(labourContext?.eligible ? [{ key: 'labour', label: 'Labour & Delivery', Icon: Baby }] as const : []),
        ] as const).map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0"
            style={activeTab === key
              ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }
              : { background: 'transparent', color: '#64748B', border: 'none', cursor: 'pointer' }}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
        </div>
      </div>

      {/* ── Clinical tab ── */}
      {activeTab === 'clinical' && (
        <div className="space-y-4">

          {/* Care team & doctor visits (multi-doctor + per-visit billing) */}
          {adm.status === 'admitted' && (
            <CareTeamPanel admissionId={adm.id} doctors={otDoctors} canWrite={!!canWrite} />
          )}

          {/* Post-discharge follow-up booking */}
          {/* Reprintable afterwards, which is when it is usually needed. */}
          <ReferralsOutCard admissionId={adm.id} refreshKey={referralsKey}
            onEdit={(id) => { setEditReferral(id); setShowRefer(true) }} />

          {adm.status === 'discharged' && canWrite && adm.patient && (
            <FollowUpCard patientId={adm.patient_id} doctorId={adm.admitting_doctor_id} source="ipd" admissionId={adm.id} reason={adm.reason || undefined} />
          )}

          {/* Patient info card */}
          <GlassCard className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>
              Patient Details
            </p>

            {/* Blood group + allergies */}
            <div className="flex flex-wrap gap-3 mb-4">
              {adm.patient?.blood_group && (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: '#64748B' }}>Blood Group</span>
                  <span className="font-bold text-sm px-2.5 py-0.5 rounded-lg"
                    style={{ background: '#FEE2E2', color: '#DC2626' }}>
                    {adm.patient.blood_group}
                  </span>
                </div>
              )}
              {adm.patient?.allergies && (
                <div className="flex items-start gap-2">
                  <span className="text-xs mt-0.5 flex-shrink-0" style={{ color: '#B45309', fontWeight: 600 }}>
                    ⚠ Allergies
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-lg"
                    style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                    {adm.patient.allergies}
                  </span>
                </div>
              )}
              {!adm.patient?.blood_group && !adm.patient?.allergies && (
                <span className="text-xs" style={{ color: '#94A3B8' }}>No blood group or allergy info recorded</span>
              )}
            </div>

            {/* Care team row */}
            <div className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3"
              style={{ borderTop: '1px solid #F1F5F9' }}>
              <div>
                <p className="text-xs mb-0.5" style={{ color: '#64748B' }}>Attending Doctor</p>
                <p className="text-sm font-semibold break-words" style={{ color: '#0F172A' }}>
                  {adm.doctor?.full_name ?? '—'}
                </p>
              </div>

              {(() => {
                const morningAssignment = todayAssignments.find((a) => a.shift === 'morning')
                const nightAssignment   = todayAssignments.find((a) => a.shift === 'night')
                return (
                  <>
                    <div>
                      <p className="text-xs mb-0.5" style={{ color: '#64748B' }}>Morning Nurse</p>
                      <p className="text-sm font-semibold break-words" style={{ color: morningAssignment ? '#0F172A' : '#94A3B8' }}>
                        {morningAssignment?.nurse?.full_name ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs mb-0.5" style={{ color: '#64748B' }}>Night Nurse</p>
                      <p className="text-sm font-semibold break-words" style={{ color: nightAssignment ? '#0F172A' : '#94A3B8' }}>
                        {nightAssignment?.nurse?.full_name ?? '—'}
                      </p>
                    </div>
                  </>
                )
              })()}

              <div>
                <p className="text-xs mb-0.5" style={{ color: '#64748B' }}>Ward / Bed</p>
                <p className="text-sm font-semibold break-words" style={{ color: '#0F172A' }}>
                  {adm.ward?.name} — {adm.bed?.bed_no}
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Surgeries */}
          {otSchedules.length > 0 && (
            <GlassCard className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Scissors className="w-4 h-4" style={{ color: '#0D9488' }} />
                <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Surgeries</h2>
              </div>
              <div className="space-y-2">
                {otSchedules.map(s => {
                  const sc = OT_STATUS_COLORS[s.status] ?? OT_STATUS_COLORS.scheduled
                  return (
                    <a key={s.id} href={`/ot/${s.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: sc.bg, border: `1px solid ${sc.border}`, textDecoration: 'none' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{s.procedure_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
                          {fmtDateShort(s.scheduled_start)} · {fmtTime(s.scheduled_start)} – {fmtTime(s.scheduled_end)}
                          {s.room && <> · <span style={{ color: '#0D9488' }}>{s.room.name}</span></>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {s.price_snapshot > 0 && (
                          <Money amount={s.price_snapshot} className="text-xs font-semibold" style={{ color: '#0D9488' }} />
                        )}
                        <span className="text-xs px-2 py-0.5 rounded-lg font-medium"
                          style={{ background: sc.border, color: sc.text }}>
                          {s.status.replace('_', ' ')}
                        </span>
                      </div>
                    </a>
                  )
                })}
              </div>
            </GlassCard>
          )}

          {/* Add note form */}
          {!isClosed && canNote && (
            <GlassCard className="p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>
                <FileText className="w-4 h-4" style={{ color: '#0D9488' }} />
                Daily Vitals &amp; Note
              </h3>
              <form onSubmit={handleAddNote} className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['bp', 'pulse', 'temp', 'spo2'] as const).map((key) => (
                    <FormField key={key} label={key.toUpperCase()}>
                      <Input
                        value={(vitals as Record<string, string>)[key] ?? ''}
                        onChange={(e) => setVitals((v) => ({ ...v, [key]: e.target.value }))}
                        placeholder={key === 'bp' ? '120/80' : key === 'pulse' ? '72' : key === 'temp' ? '98.6' : '98%'}
                        style={{ padding: '0.375rem 0.5rem', fontSize: '0.75rem' }}
                      />
                    </FormField>
                  ))}
                </div>
                <FormField label="Clinical Note">
                  <SpeechTextarea
                    variant="field"
                    fieldKey="ipd.progress_note"
                    value={note}
                    onChange={setNote}
                    placeholder="Observations, plan, instructions…"
                    style={{ minHeight: '4rem' }}
                  />
                </FormField>
                {noteError && <p className="text-xs" style={{ color: '#DC2626' }}>{noteError}</p>}
                <button type="submit" disabled={noteSaving || !note.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
                  style={{
                    background: (noteSaving || !note.trim()) ? '#94A3B8' : '#0D9488',
                    color: '#fff', border: 'none',
                    cursor: (noteSaving || !note.trim()) ? 'not-allowed' : 'pointer',
                  }}>
                  <Plus className="w-4 h-4" />
                  {noteSaving ? 'Saving…' : 'Add Note'}
                </button>
              </form>
            </GlassCard>
          )}

          {/* Notes timeline */}
          <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
            <FileText className="w-4 h-4" style={{ color: '#0D9488' }} />
            Progress Notes
          </h3>
          {notes.length === 0 ? (
            <GlassCard className="p-6">
              <p className="text-sm text-center" style={{ color: '#94A3B8' }}>No progress notes yet.</p>
            </GlassCard>
          ) : (
            notes.map((n) => (
              <GlassCard key={n.id} className="p-4">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <p className="text-xs font-semibold" style={{ color: '#0D9488' }}>
                    {n.author?.full_name ?? 'Unknown'} · <span className="capitalize">{n.author?.role}</span>
                  </p>
                  <span className="text-xs" style={{ color: '#94A3B8' }}>
                    {n.created_at
                      ? new Date(n.created_at).toLocaleString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', hour12: true,
                        })
                      : '—'}
                  </span>
                </div>
                <p className="text-sm" style={{ color: '#0F172A', whiteSpace: 'pre-wrap' }}>{n.note}</p>
                {n.vitals && Object.values(n.vitals).some(Boolean) && (
                  <div className="flex gap-3 mt-2 flex-wrap">
                    {Object.entries(n.vitals).filter(([, v]) => v).map(([key, val]) => (
                      <span key={key} className="text-xs px-2 py-0.5 rounded-lg font-mono"
                        style={{ background: 'rgba(13,148,136,0.07)', color: '#0D9488' }}>
                        {key.toUpperCase()}: {String(val)}
                      </span>
                    ))}
                  </div>
                )}
              </GlassCard>
            ))
          )}
        </div>
      )}


      {/* ── Treatment tab ── */}
      {activeTab === 'treatment' && (
        <TreatmentPanel
          admissionId={adm.id}
          patientId={adm.patient_id}
          canOrder={!!canWrite && !isClosed}
          canGive={!!canNursing && !isClosed}
        />
      )}

      {/* ── Labour & Delivery tab ── */}
      {activeTab === 'labour' && labourContext && (
        <LabourDeliveryPanel admissionId={adm.id} initial={labourContext} canWrite={!!canWrite} canNurse={!!canNursing} />
      )}

      {/* ── Critical Care tab ── */}
      {activeTab === 'critical' && (
        <CriticalCarePanel admission={adm} canWrite={!!canWrite} canNurse={!!canNursing} />
      )}

      {/* ── Nursing tab ── */}
      {activeTab === 'nursing' && (
        adm.status === 'admitted' ? (
          <div className="space-y-4">
            <NursingPanel
              admissionId={adm.id}
              canAssign={!!canNursing}
              today={today}
            />
            <NursingDocsPanel admissionId={adm.id} canWrite={!!canNursing} />
          </div>
        ) : (
          <GlassCard className="p-6">
            <p className="text-sm text-center" style={{ color: '#94A3B8' }}>
              Nursing assignments are only available for active admissions.
            </p>
          </GlassCard>
        )
      )}

{/* Transfer modal */}
      <ReferPatientModal
        open={showRefer} onClose={() => { setShowRefer(false); setEditReferral(null) }}
        onSaved={() => { setReferralsKey((n) => n + 1); router.refresh() }}
        patientId={adm.patient_id} admissionId={adm.id} source="ipd"
        referralId={editReferral} />

      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title="Transfer Patient">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: '#475569' }}>
            Current: <strong>{adm.ward?.name}</strong> — Bed <strong>{adm.bed?.bed_no}</strong>
          </p>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="New Ward">
              <Select value={transferWardId} onChange={(e) => {
                setTransferWardId(e.target.value)
                setTransferBedId('')
                setTransferBeds(availableWards.find(w => w.id === e.target.value)?.availableBeds ?? [])
              }}>
                <option value="">Select ward…</option>
                {availableWards.map((w) => (
                  <option key={w.id} value={w.id}>{w.name} ({w.availableBeds.length} avail.)</option>
                ))}
              </Select>
            </FormField>
            <FormField label="New Bed">
              <Select value={transferBedId} onChange={(e) => setTransferBedId(e.target.value)}
                disabled={!transferWardId}>
                <option value="">Select bed…</option>
                {transferBeds.map((b) => <option key={b.id} value={b.id}>{b.bed_no}</option>)}
              </Select>
            </FormField>
          </div>
          {transferError && <p className="text-sm" style={{ color: '#DC2626' }}>{transferError}</p>}
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowTransfer(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
              Cancel
            </button>
            <button onClick={handleTransfer} disabled={transferring || !transferBedId}
              className="px-5 py-2 rounded-xl text-sm font-semibold"
              style={{
                background: (transferring || !transferBedId) ? '#94A3B8' : '#1D4ED8',
                color: '#fff', border: 'none',
                cursor: (transferring || !transferBedId) ? 'not-allowed' : 'pointer',
              }}>
              {transferring ? 'Transferring…' : 'Transfer'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Discharge modal */}
      {showDischarge && (
        <DischargeModal open={showDischarge} admissionId={adm.id}
          onClose={() => setShowDischarge(false)} onDischarged={handleDischarged} />
      )}

      {showBillBuilder && adm.patient && (
        <BillBuilderModal
          preselectedPatient={adm.patient}
          admissionId={adm.id}
          onClose={() => setShowBillBuilder(false)}
          onGenerated={(billId) => {
            setShowBillBuilder(false)
            setShowBillingPrompt(false)
            router.push(`/billing/${billId}`)
          }}
        />
      )}

      {showWristband && adm.patient && (
        <WristbandLabelModal
          admissionId={adm.id}
          patient={adm.patient as import('@/lib/types').Patient}
          onClose={() => setShowWristband(false)}
        />
      )}

      {/* Schedule Surgery modal — patient pre-filled from IPD admission */}
      <ScheduleModal
        open={showScheduleOt}
        onClose={() => setShowScheduleOt(false)}
        doctors={otDoctors}
        tariffs={otTariffs}
        defaultDate={today}
        admission={{
          id: adm.id,
          patient_id: adm.patient_id,
          patient: adm.patient as { id: string; full_name: string; uhid: string } | undefined,
        }}
        onSuccess={(scheduleId?: string) => {
          setShowScheduleOt(false)
          // Refresh OT schedules list after scheduling
          import('@/app/actions/ot').then(m =>
            m.listAdmissionSchedules(adm.id).then(setOtSchedules)
          )
          void scheduleId
        }}
      />

      {/* Request Blood — pre-filled + linked to this admission (charge auto-bills here) */}
      {showBloodRequest && adm.patient && (
        <RaiseRequestModal
          open={true}
          onClose={() => setShowBloodRequest(false)}
          onSuccess={() => setShowBloodRequest(false)}
          prefill={{
            patient: { id: adm.patient.id, full_name: adm.patient.full_name, uhid: adm.patient.uhid },
            admissionId: adm.id,
            encounterLabel: `IPD · ${adm.ward?.name ?? ''} ${adm.bed?.bed_no ?? ''}`.trim(),
          }}
        />
      )}
    </div>
  )
}
