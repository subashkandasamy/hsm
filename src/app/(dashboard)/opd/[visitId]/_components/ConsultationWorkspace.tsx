'use client'

import { useState, useEffect } from 'react'
import { useDrugSearch } from '@/lib/hooks/useDrugSearch'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, User, Droplet, AlertTriangle, ChevronDown, ChevronRight,
  Activity, FileText, Pill, CheckCircle, Plus, Trash2, Save, Lock,
  FlaskConical, Scan, BedDouble, Printer, Loader2, Send,
} from 'lucide-react'
import Link from 'next/link'
import GlassCard from '@/components/ui/GlassCard'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/context/AuthContext'
import {
  saveVitals, saveConsultation, addPrescription, removePrescription, closeVisit, reopenVisit,
} from '@/app/actions/opd'
import { useSpeechInput } from '@/hooks/useSpeechInput'
import MicButton from '@/components/ui/MicButton'
import type { Visit, Patient, Prescription, LabTestCatalog, RadiologyCatalog, LabOrder, RadiologyOrder, PatientAllergy, ClinicalTemplate, DentalTooth, DentalTreatment, DentalRecall } from '@/lib/types'
import type { EyeExamData } from '@/lib/types'
import OrderLabModal from '@/app/(dashboard)/lab/_components/OrderLabModal'
import OrderRadiologyModal from '@/app/(dashboard)/radiology/_components/OrderRadiologyModal'
import LabReportModal from '@/app/(dashboard)/lab/_components/LabReportModal'
import RadiologyReportModal from '@/app/(dashboard)/radiology/_components/RadiologyReportModal'
import HistoryProblemsPanel from './HistoryProblemsPanel'
import IcdPicker from '@/components/ui/IcdPicker'
import { checkPrescriptionSafety } from '@/app/actions/rxSafety'
import DoseCheckPanel from '@/components/ui/DoseCheckPanel'
import FollowUpCard from './FollowUpCard'
import ReferPatientModal from '@/components/clinical/ReferPatientModal'
import ReferralsOutCard from '@/components/clinical/ReferralsOutCard'
import ExaminationPanel from './ExaminationPanel'
import SendToPatientButton from '@/components/ui/SendToPatientButton'
import { sendPrescriptionNotification } from '@/app/actions/notifications'
import AdmitModal from '@/app/(dashboard)/wards/_components/AdmitModal'
import AllergyBanner from '@/components/ui/AllergyBanner'
import FrequencyPicker from './FrequencyPicker'
import InstructionsPicker from './InstructionsPicker'
import DentalClinicalSection from './DentalClinicalSection'
import EyeClinicalSection from './EyeClinicalSection'
import PaediatricClinicalSection from './PaediatricClinicalSection'
import ObgynClinicalSection from './ObgynClinicalSection'
import type { ObgynContext } from '@/app/actions/obstetrics'
import type { PaediatricAssessment } from '@/app/actions/pediatrics'
import type { ObgynVisitData, PaediatricVisitData } from '@/lib/types'

interface WardOption {
  id: string
  name: string
  is_temp: boolean
  is_multi_bed: boolean
  room_type_id: string | null
  room_type_name: string | null
  availableBeds: { id: string; bed_no: string }[]
}

interface Props {
  visit: Visit
  patient: Patient
  history: Visit[]
  labCatalog: LabTestCatalog[]
  radiologyCatalog: RadiologyCatalog[]
  labOrders?: LabOrder[]
  radiologyOrders?: RadiologyOrder[]
  allergies: PatientAllergy[]
  clinicalTemplate?: ClinicalTemplate
  dentalTeeth?: DentalTooth[] | null
  dentalTreatments?: DentalTreatment[] | null
  dentalRecalls?: DentalRecall[] | null
  paediatricAssessment?: PaediatricAssessment | null
  obgynContext?: ObgynContext | null
  // IPD admission
  admitDoctors: { id: string; full_name: string }[]
  admitWards: WardOption[]
  admitTariffs: import('@/lib/types').ProcedureTariff[]
  admitGeneralTariffPrice?: number
  admitAdvancePercentage?: number
  plan?: import('@/lib/plans').PlanKey
  tenantStatus?: import('@/lib/plans').TenantStatus
}

function computeAge(dob: string | null) {
  if (!dob) return null
  const t = new Date()
  const b = new Date(dob)
  let a = t.getFullYear() - b.getFullYear()
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--
  return a
}

export default function ConsultationWorkspace({
  visit: initialVisit, patient, history, labCatalog, radiologyCatalog, labOrders = [], radiologyOrders = [], allergies,
  clinicalTemplate = 'general', dentalTeeth, dentalTreatments, dentalRecalls,
  admitDoctors, admitWards, admitTariffs, admitGeneralTariffPrice, admitAdvancePercentage = 50,
  paediatricAssessment = null, obgynContext = null, plan = 'starter', tenantStatus = 'trial',
}: Props) {
  const router = useRouter()
  const { profile } = useAuth()
  const isDoctor = profile?.role === 'doctor' || profile?.role === 'admin'
  const canVitals = profile?.role === 'nurse' || isDoctor

  const [visit, setVisit] = useState(initialVisit)
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(initialVisit.prescriptions ?? [])
  const isClosed = visit.status === 'closed'

  // Investigation order modals
  const [showLabOrder, setShowLabOrder] = useState(false)
  const [showRadOrder, setShowRadOrder] = useState(false)
  const [labOrdered, setLabOrdered] = useState(false)
  const [radOrdered, setRadOrdered] = useState(false)
  // Report viewers (read-only for the doctor)
  const [viewLabOrder, setViewLabOrder] = useState<LabOrder | null>(null)
  const [viewRadOrder, setViewRadOrder] = useState<RadiologyOrder | null>(null)

  // Vitals form
  const [vitals, setVitals] = useState({
    bp: (visit.vitals?.bp ?? '') as string,
    pulse: (visit.vitals?.pulse ?? '') as string,
    temp: (visit.vitals?.temp ?? '') as string,
    spo2: (visit.vitals?.spo2 ?? '') as string,
    weight: (visit.vitals?.weight ?? '') as string,
    height: (visit.vitals?.height ?? '') as string,
  })
  const [vitalsSaving, setVitalsSaving] = useState(false)
  const [vitalsSaved, setVitalsSaved] = useState(false)

  // Consultation form
  const [consult, setConsult] = useState({
    complaint: visit.complaint ?? '',
    diagnosis: visit.diagnosis ?? '',
    icd_code: visit.icd_code ?? '',
    notes: visit.notes ?? '',
  })
  const [consultSaving, setConsultSaving] = useState(false)
  const [consultSaved, setConsultSaved] = useState(false)
  const [consultError, setConsultError] = useState<string | null>(null)

  // New prescription form
  const [newRx, setNewRx] = useState({
    drug_name: '', dosage: '', frequency: '', duration: '', instructions: '',
  })
  const [rxSaving, setRxSaving] = useState(false)
  const [rxError, setRxError] = useState<string | null>(null)
  const [removingRx, setRemovingRx] = useState<string | null>(null)
  const [rxWarnings, setRxWarnings] = useState<import('@/lib/types').RxWarning[]>([])
  const [rxOverride, setRxOverride] = useState(false)

  // Prescribing safety — allergy + interaction check as the doctor types a drug.
  useEffect(() => {
    const name = newRx.drug_name.trim()
    if (!isDoctor || isClosed || name.length < 3) { setRxWarnings([]); return }
    let active = true
    const t = setTimeout(async () => {
      const w = await checkPrescriptionSafety(patient.id, name, prescriptions.map((p) => p.drug_name))
      if (active) setRxWarnings(w)
    }, 400)
    return () => { active = false; clearTimeout(t) }
  }, [newRx.drug_name, isDoctor, isClosed, patient.id, prescriptions])

  // Drug autocomplete
  const drugSuggestions = useDrugSearch(newRx.drug_name, 10)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)

  // Close dialog
  const [showClose, setShowClose] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  // Reopen visit
  const [reopening, setReopening] = useState(false)

  // Admit to IPD
  const [showAdmit, setShowAdmit] = useState(false)
  const [showRefer, setShowRefer] = useState(false)
  const [referralsKey, setReferralsKey] = useState(0)

  // History expanded
  const [historyOpen, setHistoryOpen] = useState(false)

  // Speech-to-text for consultation fields
  const speechComplaint = useSpeechInput({ onAppend: (t) => setConsult((c) => ({ ...c, complaint: c.complaint ? `${c.complaint} ${t}` : t })) })
  const speechDiagnosis = useSpeechInput({ onAppend: (t) => setConsult((c) => ({ ...c, diagnosis: c.diagnosis ? `${c.diagnosis} ${t}` : t })) })
  const speechNotes     = useSpeechInput({ onAppend: (t) => setConsult((c) => ({ ...c, notes: c.notes ? `${c.notes} ${t}` : t })) })

  async function handleSaveVitals() {
    setVitalsSaving(true)
    const result = await saveVitals(visit.id, vitals)
    setVitalsSaving(false)
    if (result.success) {
      setVitalsSaved(true)
      setTimeout(() => setVitalsSaved(false), 2000)
    }
  }

  async function handleSaveConsult() {
    setConsultSaving(true)
    setConsultError(null)
    const result = await saveConsultation(visit.id, {
      complaint: consult.complaint || null,
      diagnosis: consult.diagnosis || null,
      icd_code: consult.icd_code || null,
      notes: consult.notes || null,
    })
    setConsultSaving(false)
    if (result.success) {
      setConsultSaved(true)
      setTimeout(() => setConsultSaved(false), 2000)
    } else {
      setConsultError(result.error)
    }
  }

  // The prescription prints as a server-generated PDF from saved data, so unsaved
  // vitals/notes are saved first. The tab is opened synchronously (before any await)
  // so popup blockers allow it, then pointed at the PDF once saving is done.
  const [printingRx, setPrintingRx] = useState(false)
  async function handlePrintRx() {
    const tab = window.open('about:blank', '_blank')
    setPrintingRx(true)
    const saved = visit.vitals ?? {}
    const vitalsDirty = (Object.keys(vitals) as Array<keyof typeof vitals>).some((k) => (vitals[k] || '') !== ((saved[k] as string | undefined) ?? ''))
    const consultDirty = consult.complaint !== (visit.complaint ?? '') || consult.diagnosis !== (visit.diagnosis ?? '')
      || consult.icd_code !== (visit.icd_code ?? '') || consult.notes !== (visit.notes ?? '')
    if (vitalsDirty) {
      const r = await saveVitals(visit.id, vitals)
      if (r.success) setVisit((v) => ({ ...v, vitals: { ...vitals } }))
    }
    if (consultDirty) {
      const r = await saveConsultation(visit.id, {
        complaint: consult.complaint || null, diagnosis: consult.diagnosis || null,
        icd_code: consult.icd_code || null, notes: consult.notes || null,
      })
      if (r.success) setVisit((v) => ({ ...v, complaint: consult.complaint || null, diagnosis: consult.diagnosis || null, icd_code: consult.icd_code || null, notes: consult.notes || null }))
      else setConsultError(r.error)
    }
    setPrintingRx(false)
    const url = `/opd/${visit.id}/prescription/pdf`
    if (tab) tab.location.href = url
    else window.open(url, '_blank')
  }

  async function handleAddRx(e: React.FormEvent) {
    e.preventDefault()
    if (!newRx.drug_name.trim()) { setRxError('Drug name is required'); return }
    setRxSaving(true)
    setRxError(null)
    const result = await addPrescription(visit.id, {
      drug_name: newRx.drug_name,
      dosage: newRx.dosage || null,
      frequency: newRx.frequency || null,
      duration: newRx.duration || null,
      instructions: newRx.instructions || null,
      dose_override: rxOverride,
    })
    setRxSaving(false)
    if (result.success) {
      setPrescriptions((p) => [...p, result.prescription])
      setNewRx({ drug_name: '', dosage: '', frequency: '', duration: '', instructions: '' })
      setRxOverride(false)
    } else {
      setRxError(result.error)
    }
  }

  async function handleRemoveRx(id: string) {
    setRemovingRx(id)
    const result = await removePrescription(id)
    if (result.success) {
      setPrescriptions((p) => p.filter((r) => r.id !== id))
    }
    setRemovingRx(null)
  }

  async function handleClose() {
    setClosing(true)
    setCloseError(null)
    const result = await closeVisit(visit.id)
    setClosing(false)
    if (result.success) {
      setVisit((v) => ({ ...v, status: 'closed' }))
      setShowClose(false)
      router.refresh()
    } else {
      setCloseError(result.error)
    }
  }

  async function handleReopen() {
    setReopening(true)
    const result = await reopenVisit(visit.id)
    setReopening(false)
    if (result.success) {
      setVisit((v) => ({ ...v, status: 'open' }))
      router.refresh()
    }
  }

  const age = computeAge(patient.dob)

  return (
    <div>
      <div className="no-print">
      {/* Back + Print */}
      <div className="flex items-center justify-between mb-4">
        <Link href="/opd" className="inline-flex items-center gap-1.5 text-sm"
          style={{ color: '#64748B' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#0D9488' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B' }}>
          <ArrowLeft className="w-4 h-4" /> Back to OPD
        </Link>
        <button
          onClick={handlePrintRx}
          disabled={printingRx}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)', cursor: printingRx ? 'wait' : 'pointer' }}
        >
          {printingRx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />} Print Prescription
        </button>
      </div>

      {/* Allergy banner */}
      {allergies.length > 0 && (
        <AllergyBanner allergies={allergies} className="mb-4" />
      )}

      {isClosed && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-semibold"
          style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0' }}>
          <span className="flex items-center gap-2"><Lock className="w-4 h-4" /> This visit is closed — read-only view</span>
          {isDoctor && (
            <button onClick={handleReopen} disabled={reopening}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: '#fff', color: '#0D9488', border: '1px solid #0D9488', cursor: reopening ? 'not-allowed' : 'pointer', opacity: reopening ? 0.6 : 1 }}>
              {reopening ? 'Re-opening…' : 'Re-open Visit'}
            </button>
          )}
        </div>
      )}

      {/* ── Patient details card (top, full-width) ── */}
      <GlassCard className="p-4 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <User className="w-5 h-5" style={{ color: '#0D9488' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/patients/${patient.id}`}
                className="font-bold text-base hover:underline"
                style={{ color: '#0F172A' }}>
                {patient.full_name}
              </Link>
              <span className="font-mono text-xs px-2 py-0.5 rounded-lg"
                style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>
                {patient.uhid}
              </span>
              <StatusBadge status={visit.status} label={visit.status} />
            </div>
            {age !== null && (
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                {age}y · <span className="capitalize">{patient.gender ?? '—'}</span>
              </p>
            )}
          </div>
        </div>

        {/* Blood group + allergies */}
        <div className="flex flex-wrap gap-3 mb-4">
          {patient.blood_group ? (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: '#64748B' }}>Blood Group</span>
              <span className="flex items-center gap-1 font-bold text-sm px-2.5 py-0.5 rounded-lg"
                style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                <Droplet className="w-3 h-3" />{patient.blood_group}
              </span>
            </div>
          ) : null}
          {allergies.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold" style={{ color: '#B45309' }}>
                ⚠ Allergies
              </span>
              <div className="flex flex-wrap gap-1">
                {allergies.map((a) => (
                  <span key={a.id} className="text-xs px-2 py-0.5 rounded-lg"
                    style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                    {a.allergen}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!patient.blood_group && allergies.length === 0 && (
            <span className="text-xs" style={{ color: '#94A3B8' }}>No blood group or allergy info recorded</span>
          )}
        </div>

        {/* Visit meta row */}
        <div className="pt-3 grid grid-cols-2 sm:grid-cols-3 gap-3"
          style={{ borderTop: '1px solid #F1F5F9' }}>
          <div>
            <p className="text-xs mb-0.5" style={{ color: '#64748B' }}>Consulting Doctor</p>
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
              {visit.doctor?.full_name ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs mb-0.5" style={{ color: '#64748B' }}>Visit Date</p>
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
              <DateText date={visit.visit_date} />
            </p>
          </div>
          {visit.complaint && (
            <div>
              <p className="text-xs mb-0.5" style={{ color: '#64748B' }}>Chief Complaint</p>
              <p className="text-sm truncate" style={{ color: '#0F172A' }}>{visit.complaint}</p>
            </div>
          )}
        </div>
      </GlassCard>

      {/* ── Past visits accordion ── */}
      {history.length > 0 && (
        <GlassCard className="overflow-hidden mb-4">
          <button
            onClick={() => setHistoryOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#0F172A' }}>
            <span>Past Visits ({history.length})</span>
            {historyOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {historyOpen && (
            <div className="px-4 pb-4 border-t" style={{ borderColor: '#E2E8F0' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3">
                {history.slice(0, 6).map((v) => (
                  <div key={v.id} className="p-3 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-xs font-semibold truncate" style={{ color: '#0F172A' }}>
                        {v.diagnosis || 'No diagnosis'}
                      </p>
                      <StatusBadge status={v.status} label={v.status} />
                    </div>
                    <p className="text-xs" style={{ color: '#64748B' }}>
                      <DateText date={v.visit_date} /> · {v.doctor?.full_name}
                    </p>
                    {(v.prescriptions?.length ?? 0) > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                        {v.prescriptions!.length} Rx
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {/* ── Clinical workspace (single column) ── */}
      <div className="space-y-5">
          {/* Vitals */}
          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold"
                style={{ color: '#0F172A' }}>
                <Activity className="w-4 h-4" style={{ color: '#0D9488' }} />
                Vitals
              </h3>
              {!isClosed && canVitals && (
                <button
                  onClick={handleSaveVitals}
                  disabled={vitalsSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    background: vitalsSaved ? '#DCFCE7' : '#0D9488',
                    color: vitalsSaved ? '#15803D' : '#fff',
                    border: 'none', cursor: vitalsSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {vitalsSaved ? <><CheckCircle className="w-3.5 h-3.5" />Saved!</> : <><Save className="w-3.5 h-3.5" />Save Vitals</>}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {([
                { key: 'bp', label: 'BP', placeholder: '120/80 mmHg' },
                { key: 'pulse', label: 'Pulse', placeholder: '72 bpm' },
                { key: 'temp', label: 'Temp', placeholder: '98.6 °F' },
                { key: 'spo2', label: 'SpO₂', placeholder: '98%' },
                { key: 'weight', label: 'Weight', placeholder: '70 kg' },
                { key: 'height', label: 'Height', placeholder: '175 cm' },
              ] as { key: keyof typeof vitals; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                <FormField key={key} label={label}>
                  <Input
                    value={vitals[key]}
                    onChange={(e) => setVitals((v) => ({ ...v, [key]: e.target.value }))}
                    placeholder={placeholder}
                    disabled={isClosed || !canVitals}
                    style={isClosed ? { opacity: 0.7 } : {}}
                  />
                </FormField>
              ))}
            </div>
          </GlassCard>

          {/* History & problem list (patient-level EMR) */}
          {isDoctor && (
            <HistoryProblemsPanel patientId={patient.id} canWrite={!isClosed && isDoctor} />
          )}

          {/* General + systemic examination (auto-BMI from vitals); collapsed by default. */}
          {isDoctor && (
            <ExaminationPanel
              visitId={visit.id}
              initialExam={(visit.clinical_data as Record<string, unknown> | null)?.general_exam as Record<string, unknown> | null}
              weight={vitals.weight}
              height={vitals.height}
              canWrite={!isClosed && isDoctor}
            />
          )}

          {/* Consultation */}
          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
                <FileText className="w-4 h-4" style={{ color: '#0D9488' }} />
                Consultation {!isDoctor && <span className="text-xs font-normal px-2 py-0.5 rounded-full"
                  style={{ background: '#FEF3C7', color: '#B45309' }}>Doctor only</span>}
              </h3>
              {!isClosed && isDoctor && (
                <button
                  onClick={handleSaveConsult}
                  disabled={consultSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    background: consultSaved ? '#DCFCE7' : '#0D9488',
                    color: consultSaved ? '#15803D' : '#fff',
                    border: 'none', cursor: consultSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {consultSaved ? <><CheckCircle className="w-3.5 h-3.5" />Saved!</> : <><Save className="w-3.5 h-3.5" />Save</>}
                </button>
              )}
            </div>

            {consultError && (
              <div className="mb-4 px-3 py-2 rounded-xl text-sm"
                style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                {consultError}
              </div>
            )}

            <div className="space-y-4">
              <FormField label="Chief Complaint">
                <div className="relative">
                  <Textarea
                    value={consult.complaint}
                    onChange={(e) => setConsult((c) => ({ ...c, complaint: e.target.value }))}
                    placeholder="Patient's main complaint…"
                    disabled={isClosed || !isDoctor}
                    style={{ minHeight: '4rem', paddingRight: speechComplaint.supported && isDoctor && !isClosed ? '2.25rem' : undefined, ...((!isDoctor || isClosed) ? { opacity: 0.7 } : {}) }}
                  />
                  {speechComplaint.supported && isDoctor && !isClosed && (
                    <div className="absolute top-2 right-2">
                      <MicButton listening={speechComplaint.listening} onToggle={speechComplaint.toggle} />
                    </div>
                  )}
                </div>
                {speechComplaint.interim && (
                  <p className="text-xs mt-1 italic" style={{ color: '#0D9488' }}>🎤 {speechComplaint.interim}…</p>
                )}
              </FormField>
              {isDoctor && !isClosed && (
                <div className="mb-3">
                  <IcdPicker onPick={(code, title) => setConsult((c) => ({ ...c, icd_code: code, diagnosis: c.diagnosis?.trim() ? c.diagnosis : title }))} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Diagnosis">
                  <div className="relative">
                    <Textarea
                      value={consult.diagnosis}
                      onChange={(e) => setConsult((c) => ({ ...c, diagnosis: e.target.value }))}
                      placeholder="Clinical diagnosis…"
                      disabled={isClosed || !isDoctor}
                      style={{ minHeight: '4rem', paddingRight: speechDiagnosis.supported && isDoctor && !isClosed ? '2.25rem' : undefined, ...((!isDoctor || isClosed) ? { opacity: 0.7 } : {}) }}
                    />
                    {speechDiagnosis.supported && isDoctor && !isClosed && (
                      <div className="absolute top-2 right-2">
                        <MicButton listening={speechDiagnosis.listening} onToggle={speechDiagnosis.toggle} />
                      </div>
                    )}
                  </div>
                  {speechDiagnosis.interim && (
                    <p className="text-xs mt-1 italic" style={{ color: '#0D9488' }}>🎤 {speechDiagnosis.interim}…</p>
                  )}
                </FormField>
                <FormField label="ICD Code" hint="e.g. J06.9">
                  <Input
                    value={consult.icd_code}
                    onChange={(e) => setConsult((c) => ({ ...c, icd_code: e.target.value }))}
                    placeholder="J06.9"
                    disabled={isClosed || !isDoctor}
                    style={(!isDoctor || isClosed) ? { opacity: 0.7 } : {}}
                  />
                </FormField>
              </div>
              <FormField label="Notes">
                <div className="relative">
                  <Textarea
                    value={consult.notes}
                    onChange={(e) => setConsult((c) => ({ ...c, notes: e.target.value }))}
                    placeholder="Additional clinical notes, follow-up instructions…"
                    disabled={isClosed || !isDoctor}
                    style={{ minHeight: '5rem', paddingRight: speechNotes.supported && isDoctor && !isClosed ? '2.25rem' : undefined, ...((!isDoctor || isClosed) ? { opacity: 0.7 } : {}) }}
                  />
                  {speechNotes.supported && isDoctor && !isClosed && (
                    <div className="absolute top-2 right-2">
                      <MicButton listening={speechNotes.listening} onToggle={speechNotes.toggle} />
                    </div>
                  )}
                </div>
                {speechNotes.interim && (
                  <p className="text-xs mt-1 italic" style={{ color: '#0D9488' }}>🎤 {speechNotes.interim}…</p>
                )}
              </FormField>
            </div>
          </GlassCard>

          {/* ── Specialty Clinical Section ─────────────────────────── */}
          {clinicalTemplate === 'dental' && dentalTeeth && (
            <DentalClinicalSection
              visitId={visit.id}
              patientId={patient.id}
              initialTeeth={dentalTeeth}
              initialTreatments={dentalTreatments ?? []}
              initialRecalls={dentalRecalls ?? []}
              disabled={isClosed || !isDoctor}
            />
          )}

          {clinicalTemplate === 'ophthalmology' && (
            <EyeClinicalSection
              visitId={visit.id}
              initialData={visit.clinical_data ? (visit.clinical_data as unknown as EyeExamData) : null}
              disabled={isClosed || !isDoctor}
            />
          )}

          {clinicalTemplate === 'paediatrics' && paediatricAssessment && (
            <PaediatricClinicalSection
              visitId={visit.id}
              patientId={patient.id}
              initialAssessment={paediatricAssessment}
              initialData={(visit.clinical_data as { template?: string } | null)?.template === 'paediatrics' ? (visit.clinical_data as unknown as PaediatricVisitData) : null}
              disabled={isClosed || !isDoctor}
            />
          )}

          {clinicalTemplate === 'obgyn' && obgynContext && (
            <ObgynClinicalSection
              visitId={visit.id}
              patientId={patient.id}
              initialContext={obgynContext}
              initialData={(visit.clinical_data as { template?: string } | null)?.template === 'obgyn' ? (visit.clinical_data as unknown as ObgynVisitData) : null}
              disabled={isClosed || !isDoctor}
            />
          )}

          {/* Prescriptions */}
          <GlassCard className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold mb-4" style={{ color: '#0F172A' }}>
              <Pill className="w-4 h-4" style={{ color: '#0D9488' }} />
              Prescriptions
              <span className="text-xs font-normal px-2 py-0.5 rounded-full"
                style={{ background: '#F1F5F9', color: '#64748B' }}>
                {prescriptions.length} Rx
              </span>
              {isDoctor && prescriptions.length > 0 && (
                <span className="ml-auto">
                  <SendToPatientButton onSend={(ch) => sendPrescriptionNotification(visit.id, ch)} label="Send Rx" />
                </span>
              )}
            </h3>

            {prescriptions.length > 0 && (
              <div className="mb-4 rounded-xl overflow-hidden"
                style={{ border: '1px solid #E2E8F0' }}>
                {/* Mobile: cards */}
                <div className="md:hidden divide-y" style={{ borderColor: '#F1F5F9' }}>
                  {prescriptions.map((rx) => (
                    <div key={rx.id} className="px-3 py-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{rx.drug_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                          {[rx.dosage, rx.frequency, rx.duration].filter(Boolean).join(' · ') || '—'}
                        </p>
                        {rx.instructions && <p className="text-xs truncate" style={{ color: '#94A3B8' }}>{rx.instructions}</p>}
                      </div>
                      {!isClosed && isDoctor && (
                        <button onClick={() => handleRemoveRx(rx.id)} disabled={removingRx === rx.id}
                          className="p-1.5 rounded-lg flex-shrink-0"
                          style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer' }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {/* Desktop: table */}
                <table className="hidden md:table w-full text-sm">
                  <thead>
                    <tr style={{ background: 'rgba(248,250,252,0.9)', borderBottom: '1px solid #E2E8F0' }}>
                      {['Drug', 'Dosage', 'Frequency', 'Duration', 'Instructions', ''].map((h) => (
                        <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold"
                          style={{ color: '#475569' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {prescriptions.map((rx, i) => (
                      <tr key={rx.id}
                        style={{ borderBottom: i < prescriptions.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                        <td className="px-3 py-2.5 font-medium" style={{ color: '#0F172A' }}>{rx.drug_name}</td>
                        <td className="px-3 py-2.5" style={{ color: '#475569' }}>{rx.dosage ?? '—'}</td>
                        <td className="px-3 py-2.5" style={{ color: '#475569' }}>{rx.frequency ?? '—'}</td>
                        <td className="px-3 py-2.5" style={{ color: '#475569' }}>{rx.duration ?? '—'}</td>
                        <td className="px-3 py-2.5 text-xs max-w-32 truncate" style={{ color: '#64748B' }}>
                          {rx.instructions ?? '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {!isClosed && isDoctor && (
                            <button
                              onClick={() => handleRemoveRx(rx.id)}
                              disabled={removingRx === rx.id}
                              className="p-1 rounded-lg"
                              style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer' }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!isClosed && isDoctor && (
              <form onSubmit={handleAddRx}>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
                  {/* Drug name with autocomplete */}
                  <FormField label="Drug Name *">
                    <div className="relative">
                      <Input
                        value={newRx.drug_name}
                        onChange={(e) => {
                          const q = e.target.value
                          setNewRx((r) => ({ ...r, drug_name: q }))
                          setRxError(null)
                          setActiveSuggestion(-1)
                          setShowSuggestions(q.trim().length >= 2)
                        }}
                        onKeyDown={(e) => {
                          if (!showSuggestions) return
                          if (e.key === 'ArrowDown') {
                            e.preventDefault()
                            setActiveSuggestion((i) => Math.min(i + 1, drugSuggestions.length - 1))
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault()
                            setActiveSuggestion((i) => Math.max(i - 1, 0))
                          } else if (e.key === 'Enter' && activeSuggestion >= 0) {
                            e.preventDefault()
                            const d = drugSuggestions[activeSuggestion]
                            const lower2 = newRx.drug_name.toLowerCase()
                            const matchBrand = (d.brand_aliases ?? []).find(b => b.toLowerCase().includes(lower2))
                            const label = matchBrand ? matchBrand : [d.name, d.strength, d.form].filter(Boolean).join(' ')
                            setNewRx((r) => ({ ...r, drug_name: label, dosage: d.strength ?? r.dosage }))
                            setShowSuggestions(false)
                            setActiveSuggestion(-1)
                          } else if (e.key === 'Escape') {
                            setShowSuggestions(false)
                          }
                        }}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                        onFocus={() => {
                          if (drugSuggestions.length > 0) setShowSuggestions(true)
                        }}
                        placeholder="e.g. Paracetamol"
                        hasError={!!rxError}
                        autoComplete="off"
                      />
                      {showSuggestions && drugSuggestions.length > 0 && (
                        <div
                          className="absolute left-0 top-full mt-1 w-full z-50 rounded-xl overflow-hidden"
                          style={{
                            background: '#fff',
                            border: '1px solid #E2E8F0',
                            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                            minWidth: '200px',
                          }}
                        >
                          {drugSuggestions.map((d, idx) => {
                            const lower = newRx.drug_name.toLowerCase()
                            const matchingBrand = (d.brand_aliases ?? []).find(b => b.toLowerCase().includes(lower))
                            // If a brand triggered the match, use brand as the prescription label
                            const label = matchingBrand
                              ? matchingBrand
                              : [d.name, d.strength, d.form].filter(Boolean).join(' ')
                            return (
                              <button
                                key={d.id}
                                type="button"
                                onMouseDown={() => {
                                  setNewRx((r) => ({ ...r, drug_name: label, dosage: d.strength ?? r.dosage }))
                                  setShowSuggestions(false)
                                  setActiveSuggestion(-1)
                                }}
                                className="w-full text-left px-3 py-2.5 text-sm"
                                style={{
                                  background: idx === activeSuggestion ? 'rgba(13,148,136,0.08)' : 'transparent',
                                  color: '#0F172A',
                                  borderBottom: idx < drugSuggestions.length - 1 ? '1px solid #F1F5F9' : 'none',
                                  minHeight: '40px',
                                }}
                                onMouseEnter={() => setActiveSuggestion(idx)}
                              >
                                <span className="font-medium">{matchingBrand ?? d.name}</span>
                                {(d.strength || d.form) && (
                                  <span className="ml-1.5 text-xs" style={{ color: '#64748B' }}>
                                    {[d.strength, d.form].filter(Boolean).join(' · ')}
                                  </span>
                                )}
                                <span className="block text-xs" style={{ color: '#94A3B8' }}>
                                  {matchingBrand ? d.name : (d.generic_name ?? '')}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </FormField>

                  {/* Dosage */}
                  <FormField label="Dosage">
                    <Input
                      value={newRx.dosage}
                      onChange={(e) => setNewRx((r) => ({ ...r, dosage: e.target.value }))}
                      placeholder="500 mg"
                    />
                  </FormField>

                  {/* Frequency — M-A-E picker */}
                  <FormField label="Frequency">
                    <FrequencyPicker
                      value={newRx.frequency}
                      onChange={(v) => setNewRx((r) => ({ ...r, frequency: v }))}
                    />
                  </FormField>

                  {/* Duration */}
                  <FormField label="Duration">
                    <Input
                      value={newRx.duration}
                      onChange={(e) => setNewRx((r) => ({ ...r, duration: e.target.value }))}
                      placeholder="5 days"
                    />
                  </FormField>

                  {/* Instructions */}
                  <FormField label="Instructions">
                    <InstructionsPicker
                      value={newRx.instructions}
                      onChange={(v) => setNewRx((r) => ({ ...r, instructions: v }))}
                    />
                  </FormField>
                </div>
                {rxWarnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {rxWarnings.map((w, i) => {
                      const major = w.severity === 'major' || w.type === 'allergy'
                      return (
                        <div key={i} className="flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                          style={major ? { background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' } : { background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>
                          <span>{w.type === 'allergy' ? '⚠ Allergy' : w.severity === 'major' ? '⚠ Major' : 'Interaction'}</span>
                          <span style={{ fontWeight: 400 }}>{w.message}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
                <DoseCheckPanel
                  input={{ patientId: patient.id, visitId: visit.id, drugName: newRx.drug_name, dosage: newRx.dosage, frequency: newRx.frequency }}
                  override={rxOverride}
                  onOverride={setRxOverride}
                  onOverMax={(over) => { if (!over) setRxOverride(false) }}
                  canRecordWeight={!!canVitals}
                />
                {rxError && (
                  <p className="text-xs mt-1" style={{ color: '#DC2626' }}>{rxError}</p>
                )}
                <button
                  type="submit"
                  disabled={rxSaving}
                  className="flex items-center gap-1.5 mt-3 px-3 py-2 rounded-xl text-sm font-medium"
                  style={{
                    background: '#F1F5F9', color: '#475569',
                    border: '1px solid #E2E8F0', cursor: rxSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Plus className="w-4 h-4" />
                  {rxSaving ? 'Adding…' : 'Add Prescription'}
                </button>
              </form>
            )}
          </GlassCard>

          {/* Investigations */}
          {isDoctor && (
            <GlassCard className="p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold mb-4" style={{ color: '#0F172A' }}>
                <FlaskConical className="w-4 h-4" style={{ color: '#0D9488' }} />
                Investigations
                {isClosed && (
                  <span className="text-xs font-normal px-2 py-0.5 rounded-full"
                    style={{ background: '#F1F5F9', color: '#64748B' }}>Read-only</span>
                )}
              </h3>
              {(() => {
                const isStarterLocked = plan === 'starter' && tenantStatus !== 'trial'
                return (
                  <>
                    <div className="flex gap-3 flex-wrap">
                      <button
                        onClick={isStarterLocked ? undefined : () => setShowLabOrder(true)}
                        disabled={isClosed || isStarterLocked}
                        title={isStarterLocked ? 'Lab ordering requires Growth plan' : undefined}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                        style={{
                          background: labOrdered ? '#DCFCE7' : (isClosed || isStarterLocked) ? '#F1F5F9' : 'rgba(13,148,136,0.08)',
                          color: labOrdered ? '#15803D' : (isClosed || isStarterLocked) ? '#94A3B8' : '#0D9488',
                          border: `1px solid ${labOrdered ? '#BBF7D0' : (isClosed || isStarterLocked) ? '#E2E8F0' : 'rgba(13,148,136,0.2)'}`,
                          cursor: (isClosed || isStarterLocked) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <FlaskConical className="w-4 h-4" />
                        {labOrdered ? 'Lab Tests Ordered ✓' : 'Order Lab Tests'}
                        {isStarterLocked && <Lock className="w-3 h-3 ml-1" />}
                        {labCatalog.length === 0 && !labOrdered && !isStarterLocked && (
                          <span className="text-xs opacity-60">(catalog empty)</span>
                        )}
                      </button>
                      <button
                        onClick={isStarterLocked ? undefined : () => setShowRadOrder(true)}
                        disabled={isClosed || isStarterLocked}
                        title={isStarterLocked ? 'Imaging ordering requires Growth plan' : undefined}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                        style={{
                          background: radOrdered ? '#DBEAFE' : (isClosed || isStarterLocked) ? '#F1F5F9' : 'rgba(29,78,216,0.06)',
                          color: radOrdered ? '#1D4ED8' : (isClosed || isStarterLocked) ? '#94A3B8' : '#1D4ED8',
                          border: `1px solid ${radOrdered ? '#BFDBFE' : (isClosed || isStarterLocked) ? '#E2E8F0' : 'rgba(29,78,216,0.15)'}`,
                          cursor: (isClosed || isStarterLocked) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Scan className="w-4 h-4" />
                        {radOrdered ? 'Imaging Ordered ✓' : 'Order Imaging'}
                        {isStarterLocked && <Lock className="w-3 h-3 ml-1" />}
                        {radiologyCatalog.length === 0 && !radOrdered && !isStarterLocked && (
                          <span className="text-xs opacity-60">(catalog empty)</span>
                        )}
                      </button>
                    </div>
                    {isStarterLocked && (
                      <p className="mt-3 text-xs" style={{ color: '#94A3B8' }}>
                        Lab and imaging ordering is available on the <strong style={{ color: '#0D9488' }}>Growth plan</strong>. <a href="/account/subscription?upgrade=1" style={{ color: '#0D9488', textDecoration: 'underline' }}>Upgrade</a>
                      </p>
                    )}
                    {!isStarterLocked && (labCatalog.length === 0 || radiologyCatalog.length === 0) && !isClosed && (
                      <p className="mt-3 text-xs" style={{ color: '#94A3B8' }}>
                        Ask an admin to add tests to the catalog before ordering.
                      </p>
                    )}
                  </>
                )
              })()}

              {/* Investigation reports — read-only view/print once completed */}
              {(labOrders.length > 0 || radiologyOrders.length > 0) && (
                <div className="mt-5 pt-4" style={{ borderTop: '1px solid #F1F5F9' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2.5" style={{ color: '#64748B', letterSpacing: '0.5px' }}>
                    Reports
                  </p>
                  <div className="space-y-1.5">
                    {labOrders.map((o) => {
                      const done = o.status === 'reported'
                      return (
                        <div key={o.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ background: '#F8FAFC' }}>
                          <FlaskConical className="w-4 h-4 flex-shrink-0" style={{ color: '#0D9488' }} />
                          <span className="text-sm font-medium min-w-0 truncate" style={{ color: '#0F172A' }}>
                            {(o.items ?? []).map((it) => it.test?.name).filter(Boolean).join(', ') || 'Lab tests'}
                          </span>
                          <StatusBadge status={done ? 'success' : 'pending'} label={done ? 'Reported' : o.status} />
                          <div className="ml-auto flex-shrink-0">
                            {done ? (
                              <button onClick={() => setViewLabOrder(o)}
                                className="px-3 py-1 rounded-lg text-xs font-semibold"
                                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                View Report
                              </button>
                            ) : (
                              <span className="text-xs" style={{ color: '#94A3B8' }}>Awaiting result</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {radiologyOrders.map((o) => {
                      const done = o.status === 'reported'
                      return (
                        <div key={o.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ background: '#F8FAFC' }}>
                          <Scan className="w-4 h-4 flex-shrink-0" style={{ color: '#1D4ED8' }} />
                          <span className="text-sm font-medium min-w-0 truncate" style={{ color: '#0F172A' }}>
                            {o.test?.name ?? 'Imaging'}
                          </span>
                          <StatusBadge status={done ? 'success' : 'pending'} label={done ? 'Reported' : o.status} />
                          <div className="ml-auto flex-shrink-0">
                            {done ? (
                              <button onClick={() => setViewRadOrder(o)}
                                className="px-3 py-1 rounded-lg text-xs font-semibold"
                                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                View Report
                              </button>
                            ) : (
                              <span className="text-xs" style={{ color: '#94A3B8' }}>Awaiting report</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </GlassCard>
          )}

          {/* Reprintable afterwards, which is when it is usually needed. */}
          <ReferralsOutCard visitId={visit.id} refreshKey={referralsKey} />

          {/* Follow-up appointment */}
          {isDoctor && !isClosed && (
            <FollowUpCard patientId={patient.id} doctorId={visit.doctor_id} source="opd" visitId={visit.id} reason={consult.diagnosis || undefined} />
          )}

          {/* Action row: Admit to IPD + Close Visit */}
          {!isClosed && isDoctor && (
            <div className="flex items-center justify-end gap-3 flex-wrap">
              {plan === 'starter' && tenantStatus !== 'trial' ? (
                <a href="/account/subscription?upgrade=1"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: '#F1F5F9', color: '#94A3B8', border: '1px solid #E2E8F0', cursor: 'not-allowed', textDecoration: 'none' }}
                  onClick={(e) => e.preventDefault()}
                  title="Upgrade to Growth plan to admit patients to IPD">
                  <Lock className="w-4 h-4" />
                  Admit to IPD
                </a>
              ) : (
              <button
                onClick={() => setShowAdmit(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.3)', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.18)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.1)' }}
              >
                <BedDouble className="w-4 h-4" />
                Admit to IPD
              </button>
              )}
              {/*
                Beside Admit, because they are the two ways a consultation ends
                when the patient cannot simply go home: kept here, or sent on.
              */}
              <button
                type="button"
                onClick={() => setShowRefer(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.3)', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.18)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.1)' }}
              >
                <Send className="w-4 h-4" />
                Refer Out
              </button>
              <button
                onClick={() => setShowClose(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#B91C1C' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#DC2626' }}
              >
                <Lock className="w-4 h-4" />
                Close Visit
              </button>
            </div>
          )}
      </div>

      <ConfirmDialog
        open={showClose}
        onClose={() => { setShowClose(false); setCloseError(null) }}
        onConfirm={handleClose}
        title="Close Visit"
        description={
          closeError
            ? `Error: ${closeError}`
            : 'Closing the visit will mark it as done and the appointment as completed. You will not be able to add prescriptions after this. Continue?'
        }
        confirmLabel="Close Visit"
        confirmVariant="danger"
        loading={closing}
      />

      <OrderLabModal
        open={showLabOrder}
        onClose={() => setShowLabOrder(false)}
        catalog={labCatalog}
        prefill={{ patientId: patient.id, patientName: patient.full_name, visitId: visit.id }}
        onSuccess={() => { setShowLabOrder(false); setLabOrdered(true) }}
      />

      <OrderRadiologyModal
        open={showRadOrder}
        onClose={() => setShowRadOrder(false)}
        catalog={radiologyCatalog}
        prefill={{ patientId: patient.id, patientName: patient.full_name, visitId: visit.id }}
        onSuccess={() => { setShowRadOrder(false); setRadOrdered(true) }}
      />

      {viewLabOrder && (
        <LabReportModal
          order={viewLabOrder}
          canEdit={false}
          onClose={() => setViewLabOrder(null)}
          onEdit={() => {}}
        />
      )}

      {viewRadOrder && (
        <RadiologyReportModal
          order={viewRadOrder}
          onClose={() => setViewRadOrder(null)}
        />
      )}

      <ReferPatientModal
        open={showRefer} onClose={() => setShowRefer(false)}
        onSaved={() => setReferralsKey((n) => n + 1)}
        patientId={visit.patient_id} visitId={visit.id} source="opd" />

      {showAdmit && (
        <AdmitModal
          open={showAdmit}
          onClose={() => setShowAdmit(false)}
          onSuccess={(admissionId) => {
            setShowAdmit(false)
            router.push(`/ipd/${admissionId}`)
          }}
          doctors={admitDoctors}
          wards={admitWards}
          procedureTariffs={admitTariffs}
          generalTariffPrice={admitGeneralTariffPrice}
          advancePercentage={admitAdvancePercentage}
          preselectedPatient={{ id: patient.id, full_name: patient.full_name, uhid: patient.uhid }}
          sourceVisitId={visit.id}
        />
      )}

      </div>{/* end .no-print */}

    </div>
  )
}
