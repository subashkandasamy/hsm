'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, User, Droplet, AlertTriangle, ChevronDown, ChevronRight,
  Activity, FileText, Pill, CheckCircle, Plus, Trash2, Save, Lock,
  FlaskConical, Scan, BedDouble, Printer,
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
import type { Visit, Patient, Prescription, LabTestCatalog, RadiologyCatalog, LabOrder, RadiologyOrder, Drug, PatientAllergy, ClinicalTemplate, DentalTooth, DentalTreatment, DentalRecall, TenantProfile } from '@/lib/types'
import type { EyeExamData } from '@/lib/types'
import OrderLabModal from '@/app/(dashboard)/lab/_components/OrderLabModal'
import OrderRadiologyModal from '@/app/(dashboard)/radiology/_components/OrderRadiologyModal'
import LabReportModal from '@/app/(dashboard)/lab/_components/LabReportModal'
import RadiologyReportModal from '@/app/(dashboard)/radiology/_components/RadiologyReportModal'
import HistoryProblemsPanel from './HistoryProblemsPanel'
import IcdPicker from '@/components/ui/IcdPicker'
import { checkPrescriptionSafety } from '@/app/actions/rxSafety'
import AdmitModal from '@/app/(dashboard)/wards/_components/AdmitModal'
import AllergyBanner from '@/components/ui/AllergyBanner'
import FrequencyPicker from './FrequencyPicker'
import InstructionsPicker from './InstructionsPicker'
import DentalClinicalSection from './DentalClinicalSection'
import EyeClinicalSection from './EyeClinicalSection'

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
  drugs: Drug[]
  allergies: PatientAllergy[]
  clinicalTemplate?: ClinicalTemplate
  dentalTeeth?: DentalTooth[] | null
  dentalTreatments?: DentalTreatment[] | null
  dentalRecalls?: DentalRecall[] | null
  // IPD admission
  admitDoctors: { id: string; full_name: string }[]
  admitWards: WardOption[]
  admitTariffs: import('@/lib/types').ProcedureTariff[]
  admitGeneralTariffPrice?: number
  admitAdvancePercentage?: number
  tenantProfile?: TenantProfile | null
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
  visit: initialVisit, patient, history, labCatalog, radiologyCatalog, labOrders = [], radiologyOrders = [], drugs, allergies,
  clinicalTemplate = 'general', dentalTeeth, dentalTreatments, dentalRecalls,
  admitDoctors, admitWards, admitTariffs, admitGeneralTariffPrice, admitAdvancePercentage = 50,
  tenantProfile = null, plan = 'starter', tenantStatus = 'trial',
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
  const [drugSuggestions, setDrugSuggestions] = useState<Drug[]>([])
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
    })
    setRxSaving(false)
    if (result.success) {
      setPrescriptions((p) => [...p, result.prescription])
      setNewRx({ drug_name: '', dosage: '', frequency: '', duration: '', instructions: '' })
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
          onClick={() => {
            const el = document.getElementById('rx-print-area')
            if (!el) return
            const old = document.getElementById('rx-print-iframe')
            if (old) old.remove()
            const iframe = document.createElement('iframe')
            iframe.id = 'rx-print-iframe'
            iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;'
            document.body.appendChild(iframe)
            const doc = iframe.contentDocument ?? iframe.contentWindow?.document
            if (!doc) { iframe.remove(); return }
            doc.open()
            doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Prescription</title><style>
              *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
              body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #0F172A; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              table { border-collapse: collapse; width: 100%; }
              td, th { vertical-align: top; }
              @page { size: A4 portrait; margin: 10mm; }
            </style></head><body>${el.innerHTML}</body></html>`)
            doc.close()
            iframe.contentWindow?.focus()
            setTimeout(() => {
              iframe.contentWindow?.print()
              iframe.addEventListener('afterprint', () => iframe.remove())
            }, 500)
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)', cursor: 'pointer' }}
        >
          <Printer className="w-3.5 h-3.5" /> Print Prescription
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

          {/* Prescriptions */}
          <GlassCard className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold mb-4" style={{ color: '#0F172A' }}>
              <Pill className="w-4 h-4" style={{ color: '#0D9488' }} />
              Prescriptions
              <span className="text-xs font-normal px-2 py-0.5 rounded-full"
                style={{ background: '#F1F5F9', color: '#64748B' }}>
                {prescriptions.length} Rx
              </span>
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
                          if (q.trim().length >= 1) {
                            const lower = q.toLowerCase()
                            const matches = drugs.filter(
                              (d) =>
                                d.name.toLowerCase().includes(lower) ||
                                (d.generic_name ?? '').toLowerCase().includes(lower) ||
                                (d.brand_aliases ?? []).some(b => b.toLowerCase().includes(lower))
                            ).slice(0, 10)
                            setDrugSuggestions(matches)
                            setShowSuggestions(matches.length > 0)
                          } else {
                            setDrugSuggestions([])
                            setShowSuggestions(false)
                          }
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
                      {showSuggestions && (
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

      {/* ── Print Prescription (hidden on screen, cloned into popup for printing) ── */}
      <div id="rx-print-area" style={{ display: 'none' }}>
        {(() => {
          const p = tenantProfile
          const hospName = p?.name || 'Hospital'
          const addrParts = [p?.address_line1, p?.address_line2, [p?.city, p?.state].filter(Boolean).join(', '), p?.pincode && `- ${p.pincode}`].filter(Boolean)
          const contactParts = [p?.phone1 && `Phone: ${p.phone1}`, p?.phone2 && p.phone2, p?.email && `Email: ${p.email}`, p?.website && `Web: ${p.website}`].filter(Boolean)
          const legalParts = [p?.cin_no && `CIN No: ${p.cin_no}`, p?.gst_no && `GST: ${p.gst_no}`].filter(Boolean)

          const templateLabel: Record<string, string> = {
            general: 'General Consultation',
            dental: 'Dental Consultation',
            ophthalmology: 'Ophthalmology Consultation',
          }
          const rxLabel = templateLabel[clinicalTemplate] ?? 'Consultation'

          const visitDate = new Date(visit.visit_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          const printedAt = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

          const eyeData = clinicalTemplate === 'ophthalmology' && visit.clinical_data
            ? visit.clinical_data as unknown as EyeExamData
            : null

          const thisVisitTreatments = clinicalTemplate === 'dental'
            ? (dentalTreatments ?? []).filter((t) => t.visit_id === visit.id)
            : []

          const cell = (content: React.ReactNode, opts?: { bold?: boolean; mono?: boolean; color?: string; span?: number; align?: string; border?: string }) => (
            <td style={{
              padding: '8px 12px',
              fontSize: '12px',
              color: opts?.color ?? '#0F172A',
              fontWeight: opts?.bold ? 700 : 400,
              fontFamily: opts?.mono ? 'monospace' : 'inherit',
              borderBottom: opts?.border ?? '1px solid #E2E8F0',
              textAlign: (opts?.align ?? 'left') as React.CSSProperties['textAlign'],
              ...(opts?.span ? { gridColumn: `span ${opts.span}` } : {}),
            }}>{content}</td>
          )

          const label = (text: string) => (
            <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.6px', margin: '0 0 3px' }}>{text}</p>
          )
          const value = (text: string | null | undefined, fallback = '—') => (
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', margin: 0 }}>{text || fallback}</p>
          )

          return (
            <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: '#fff', color: '#0F172A' }}>

              {/* Hospital header */}
              <div style={{ padding: '18px 28px 14px', borderBottom: '2.5px solid #0D9488' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  {p?.logo_url && (
                    <img src={p.logo_url} alt="Logo" style={{ height: '80px', width: 'auto', maxWidth: '110px', objectFit: 'contain', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px', margin: 0, lineHeight: 1.2 }}>{hospName.toUpperCase()}</h1>
                    {(p?.tagline || p?.tagline2) && (
                      <p style={{ fontSize: '12px', color: '#0D9488', fontWeight: 600, margin: '4px 0 0' }}>
                        {[p?.tagline, p?.tagline2].filter(Boolean).join('  ·  ')}
                      </p>
                    )}
                    {addrParts.length > 0 && <p style={{ fontSize: '11px', color: '#475569', margin: '4px 0 0', lineHeight: 1.5 }}>{addrParts.join(', ')}</p>}
                    {contactParts.length > 0 && <p style={{ fontSize: '11px', color: '#475569', margin: '2px 0 0' }}>{contactParts.join('  |  ')}</p>}
                    {legalParts.length > 0 && <p style={{ fontSize: '10px', color: '#94A3B8', margin: '3px 0 0', letterSpacing: '0.3px' }}>{legalParts.join('  |  ')}</p>}
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '90px' }}>
                    <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>Visit Date</p>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#0D9488', margin: '2px 0 0' }}>{visitDate}</p>
                    <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '6px 0 0' }}>UHID</p>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', margin: '2px 0 0' }}>{patient.uhid}</p>
                  </div>
                </div>
              </div>

              {/* Type banner */}
              <div style={{ background: '#F0FDF9', borderBottom: '1px solid #CCFBF1', padding: '6px 0', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '3px', color: '#0F766E', textTransform: 'uppercase' }}>{rxLabel}</span>
              </div>

              {/* Patient info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #E2E8F0' }}>
                {/* Row 1 */}
                <div style={{ padding: '10px 14px', borderRight: '1px solid #E2E8F0', gridColumn: 'span 2' }}>
                  {label('Patient Name')}
                  <p style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>{patient.full_name}</p>
                </div>
                <div style={{ padding: '10px 14px' }}>
                  {label('Doctor')}
                  {value(visit.doctor?.full_name)}
                </div>
                {/* Row 2 */}
                <div style={{ padding: '8px 14px', borderRight: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
                  {label('Age / Sex')}
                  {value(`${age !== null ? `${age} yrs` : '—'} / ${patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : '—'}`)}
                </div>
                <div style={{ padding: '8px 14px', borderRight: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
                  {label('Phone')}
                  {value(patient.phone)}
                </div>
                <div style={{ padding: '8px 14px', borderTop: '1px solid #E2E8F0' }}>
                  {label('Department')}
                  {value(rxLabel.replace(' Consultation', ''))}
                </div>
                {/* Row 3: Blood group + allergies */}
                {(patient.blood_group || allergies.length > 0) && (
                  <div style={{ padding: '8px 14px', borderTop: '1px solid #E2E8F0', gridColumn: 'span 3', display: 'flex', gap: '24px', alignItems: 'center' }}>
                    {patient.blood_group && (
                      <div>
                        {label('Blood Group')}
                        <p style={{ fontSize: '13px', fontWeight: 700, color: '#DC2626', margin: 0 }}>{patient.blood_group}</p>
                      </div>
                    )}
                    {allergies.length > 0 && (
                      <div>
                        {label('Allergies')}
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400E', margin: 0, background: '#FFFBEB', padding: '2px 8px', borderRadius: '6px', display: 'inline-block' }}>
                          ⚠ {allergies.map((a) => a.allergen).join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Vitals */}
              {Object.values(vitals).some(Boolean) && (
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #E2E8F0' }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px' }}>Vitals</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                    {[
                      { label: 'BP', value: vitals.bp },
                      { label: 'Pulse', value: vitals.pulse },
                      { label: 'Temp', value: vitals.temp },
                      { label: 'SpO₂', value: vitals.spo2 },
                      { label: 'Weight', value: vitals.weight },
                      { label: 'Height', value: vitals.height },
                    ].filter((v) => v.value).map((v) => (
                      <div key={v.label}>
                        <p style={{ fontSize: '10px', color: '#94A3B8', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{v.label}</p>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', margin: 0 }}>{v.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Consultation */}
              {(consult.complaint || consult.diagnosis || consult.icd_code || consult.notes) && (
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #E2E8F0' }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px' }}>Consultation</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
                    {consult.complaint && (
                      <div style={{ gridColumn: 'span 2' }}>
                        <p style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Chief Complaint</p>
                        <p style={{ fontSize: '13px', color: '#0F172A', margin: 0, lineHeight: 1.5 }}>{consult.complaint}</p>
                      </div>
                    )}
                    {consult.diagnosis && (
                      <div>
                        <p style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Diagnosis</p>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', margin: 0, lineHeight: 1.5 }}>{consult.diagnosis}</p>
                      </div>
                    )}
                    {consult.icd_code && (
                      <div>
                        <p style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>ICD Code</p>
                        <p style={{ fontSize: '13px', fontFamily: 'monospace', color: '#0D9488', margin: 0 }}>{consult.icd_code}</p>
                      </div>
                    )}
                    {consult.notes && (
                      <div style={{ gridColumn: 'span 2' }}>
                        <p style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Notes / Instructions</p>
                        <p style={{ fontSize: '13px', color: '#0F172A', margin: 0, lineHeight: 1.6 }}>{consult.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Eye section (ophthalmology) */}
              {eyeData && (
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #E2E8F0' }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px' }}>Eye Examination</p>
                  <div style={{ display: 'flex', gap: '32px', marginBottom: '10px' }}>
                    {(eyeData.visualAcuity?.od || eyeData.visualAcuity?.os) && (
                      <div>
                        <p style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', margin: '0 0 4px' }}>Visual Acuity</p>
                        <p style={{ fontSize: '12px', color: '#0F172A', margin: 0 }}>OD: <strong>{eyeData.visualAcuity.od || '—'}</strong> &nbsp; OS: <strong>{eyeData.visualAcuity.os || '—'}</strong></p>
                      </div>
                    )}
                    {(eyeData.iop?.od !== null || eyeData.iop?.os !== null) && (
                      <div>
                        <p style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', margin: '0 0 4px' }}>IOP (mmHg)</p>
                        <p style={{ fontSize: '12px', color: '#0F172A', margin: 0 }}>OD: <strong>{eyeData.iop.od ?? '—'}</strong> &nbsp; OS: <strong>{eyeData.iop.os ?? '—'}</strong></p>
                      </div>
                    )}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#F0FDF9' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #E2E8F0', color: '#0F766E', fontWeight: 700 }}>Refraction</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center', border: '1px solid #E2E8F0' }}>Sphere</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center', border: '1px solid #E2E8F0' }}>Cylinder</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center', border: '1px solid #E2E8F0' }}>Axis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['od', 'os'] as const).map((eye) => (
                        <tr key={eye}>
                          <td style={{ padding: '6px 10px', border: '1px solid #E2E8F0', fontWeight: 700, color: '#0D9488' }}>{eye.toUpperCase()}</td>
                          <td style={{ padding: '6px 10px', border: '1px solid #E2E8F0', textAlign: 'center' }}>{eyeData.refraction[eye].sphere ?? '—'}</td>
                          <td style={{ padding: '6px 10px', border: '1px solid #E2E8F0', textAlign: 'center' }}>{eyeData.refraction[eye].cylinder ?? '—'}</td>
                          <td style={{ padding: '6px 10px', border: '1px solid #E2E8F0', textAlign: 'center' }}>{eyeData.refraction[eye].axis ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {eyeData.notes && <p style={{ fontSize: '12px', color: '#475569', margin: '8px 0 0' }}><strong>Notes:</strong> {eyeData.notes}</p>}
                </div>
              )}

              {/* Dental treatments (dental) */}
              {clinicalTemplate === 'dental' && thisVisitTreatments.length > 0 && (
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #E2E8F0' }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px' }}>Dental Treatments</p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#F0FDF9' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #E2E8F0', color: '#0F766E' }}>#</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #E2E8F0', color: '#0F766E' }}>Tooth</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #E2E8F0', color: '#0F766E' }}>Procedure</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #E2E8F0', color: '#0F766E' }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {thisVisitTreatments.map((t, i) => (
                        <tr key={t.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                          <td style={{ padding: '6px 10px', border: '1px solid #E2E8F0' }}>{i + 1}</td>
                          <td style={{ padding: '6px 10px', border: '1px solid #E2E8F0', fontWeight: 600 }}>{t.tooth_number ?? '—'}</td>
                          <td style={{ padding: '6px 10px', border: '1px solid #E2E8F0', fontWeight: 600 }}>{t.procedure}</td>
                          <td style={{ padding: '6px 10px', border: '1px solid #E2E8F0', color: '#64748B' }}>{t.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Prescriptions */}
              {prescriptions.length > 0 && (
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #E2E8F0' }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px' }}>
                    ℞ Prescriptions
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#F0FDF9' }}>
                        {['#', 'Drug', 'Dosage', 'Frequency', 'Duration', 'Instructions'].map((h) => (
                          <th key={h} style={{ padding: '7px 10px', textAlign: 'left', border: '1px solid #E2E8F0', color: '#0F766E', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {prescriptions.map((rx, i) => (
                        <tr key={rx.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                          <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#94A3B8', fontWeight: 600 }}>{i + 1}</td>
                          <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', fontWeight: 700, color: '#0F172A' }}>{rx.drug_name}</td>
                          <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#475569' }}>{rx.dosage ?? '—'}</td>
                          <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#475569' }}>{rx.frequency ?? '—'}</td>
                          <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#475569' }}>{rx.duration ?? '—'}</td>
                          <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#64748B', fontSize: '11px' }}>{rx.instructions ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Signature + footer */}
              <div style={{ padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <p style={{ fontSize: '11px', color: '#94A3B8', margin: '0 0 4px' }}>Next Visit / Follow-up</p>
                  <div style={{ width: '180px', borderBottom: '1px dashed #CBD5E1', marginBottom: '4px' }}>&nbsp;</div>
                  <p style={{ fontSize: '11px', color: '#CBD5E1', margin: 0 }}>Date / Instructions</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ width: '160px', borderBottom: '2px solid #0F172A', marginBottom: '6px', marginLeft: 'auto' }}>&nbsp;</div>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', margin: 0 }}>{visit.doctor?.full_name ?? ''}</p>
                  <p style={{ fontSize: '11px', color: '#64748B', margin: '2px 0 0' }}>Consulting Doctor</p>
                </div>
              </div>

              {/* Printed timestamp */}
              <div style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', padding: '6px 28px', display: 'flex', justifyContent: 'space-between' }}>
                <p style={{ fontSize: '10px', color: '#94A3B8', margin: 0 }}>Printed: {printedAt}</p>
                <p style={{ fontSize: '10px', color: '#94A3B8', margin: 0 }}>This is a computer-generated prescription.</p>
              </div>

            </div>
          )
        })()}
      </div>
    </div>
  )
}
