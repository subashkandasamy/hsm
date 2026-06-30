'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, User, Droplet, AlertTriangle, ChevronDown, ChevronRight,
  Activity, FileText, Pill, CheckCircle, Plus, Trash2, Save, Lock,
  FlaskConical, Scan,
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
  saveVitals, saveConsultation, addPrescription, removePrescription, closeVisit,
} from '@/app/actions/opd'
import type { Visit, Patient, Prescription, LabTestCatalog, RadiologyCatalog, Drug, PatientAllergy, ClinicalTemplate, DentalTooth, DentalTreatment, DentalRecall } from '@/lib/types'
import type { EyeExamData } from '@/lib/types'
import OrderLabModal from '@/app/(dashboard)/lab/_components/OrderLabModal'
import OrderRadiologyModal from '@/app/(dashboard)/radiology/_components/OrderRadiologyModal'
import AllergyBanner from '@/components/ui/AllergyBanner'
import FrequencyPicker from './FrequencyPicker'
import InstructionsPicker from './InstructionsPicker'
import DentalClinicalSection from './DentalClinicalSection'
import EyeClinicalSection from './EyeClinicalSection'

interface Props {
  visit: Visit
  patient: Patient
  history: Visit[]
  labCatalog: LabTestCatalog[]
  radiologyCatalog: RadiologyCatalog[]
  drugs: Drug[]
  allergies: PatientAllergy[]
  clinicalTemplate?: ClinicalTemplate
  dentalTeeth?: DentalTooth[] | null
  dentalTreatments?: DentalTreatment[] | null
  dentalRecalls?: DentalRecall[] | null
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
  visit: initialVisit, patient, history, labCatalog, radiologyCatalog, drugs, allergies,
  clinicalTemplate = 'general', dentalTeeth, dentalTreatments, dentalRecalls,
}: Props) {
  const router = useRouter()
  const { profile } = useAuth()
  const isDoctor = profile?.role === 'doctor' || profile?.role === 'admin'
  const canVitals = profile?.role === 'nurse' || isDoctor

  const [visit, setVisit] = useState(initialVisit)
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(initialVisit.prescriptions ?? [])
  const isClosed = visit.status === 'closed'

  // Mobile panel toggle: 'history' | 'consultation'
  const [mobilePanel, setMobilePanel] = useState<'history' | 'consultation'>('consultation')

  // Investigation order modals
  const [showLabOrder, setShowLabOrder] = useState(false)
  const [showRadOrder, setShowRadOrder] = useState(false)
  const [labOrdered, setLabOrdered] = useState(false)
  const [radOrdered, setRadOrdered] = useState(false)

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

  // Drug autocomplete
  const [drugSuggestions, setDrugSuggestions] = useState<Drug[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)

  // Close dialog
  const [showClose, setShowClose] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  // History expanded
  const [historyOpen, setHistoryOpen] = useState(false)

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

  const age = computeAge(patient.dob)

  return (
    <div>
      {/* Back */}
      <Link href="/opd" className="inline-flex items-center gap-1.5 text-sm mb-4"
        style={{ color: '#64748B' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#0D9488' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B' }}>
        <ArrowLeft className="w-4 h-4" /> Back to OPD
      </Link>

      {/* Allergy banner — always visible above consultation area */}
      {allergies.length > 0 && (
        <AllergyBanner allergies={allergies} className="mb-4" />
      )}

      {isClosed && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold"
          style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0' }}>
          <Lock className="w-4 h-4" /> This visit is closed — read-only view
        </div>
      )}

      {/* Mobile panel toggle */}
      <div className="flex lg:hidden gap-1 mb-4 p-1 rounded-xl w-full"
        style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
        {(['consultation', 'history'] as const).map((panel) => (
          <button key={panel} onClick={() => setMobilePanel(panel)}
            className="flex-1 py-2 rounded-lg text-sm font-medium capitalize"
            style={mobilePanel === panel
              ? { background: '#0D9488', color: '#fff' }
              : { color: '#64748B', background: 'transparent' }}>
            {panel === 'consultation' ? 'Consultation' : `History (${history.length})`}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* ─── LEFT PANEL ─── */}
        <div className={`w-full lg:w-72 lg:flex-shrink-0 space-y-4 ${mobilePanel === 'consultation' ? 'hidden lg:block' : 'block'}`}>
          {/* Patient card */}
          <GlassCard className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)' }}>
                <User className="w-5 h-5" style={{ color: '#0D9488' }} />
              </div>
              <div className="min-w-0">
                <Link href={`/patients/${patient.id}`}
                  className="font-semibold text-sm block truncate hover:underline"
                  style={{ color: '#0F172A' }}>
                  {patient.full_name}
                </Link>
                <p className="text-xs font-mono" style={{ color: '#94A3B8' }}>{patient.uhid}</p>
                {age !== null && (
                  <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                    {age}y · <span className="capitalize">{patient.gender ?? '—'}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex gap-2 flex-wrap">
              {patient.blood_group && (
                <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-xl font-semibold"
                  style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                  <Droplet className="w-3 h-3" />{patient.blood_group}
                </span>
              )}
              {allergies.length > 0 && (
                <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-xl font-semibold"
                  style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>
                  <AlertTriangle className="w-3 h-3" />{allergies.length} Allerg{allergies.length === 1 ? 'y' : 'ies'}
                </span>
              )}
            </div>
          </GlassCard>

          {/* Past visits accordion */}
          {history.length > 0 && (
            <GlassCard className="overflow-hidden">
              <button
                onClick={() => setHistoryOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#0F172A' }}
              >
                <span>Past Visits ({history.length})</span>
                {historyOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {historyOpen && (
                <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: '#E2E8F0' }}>
                  {history.slice(0, 5).map((v) => (
                    <div key={v.id} className="pt-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold" style={{ color: '#0F172A' }}>
                          {v.diagnosis || 'No diagnosis'}
                        </p>
                        <StatusBadge status={v.status} label={v.status} />
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                        <DateText date={v.visit_date} /> · {v.doctor?.full_name}
                      </p>
                      {(v.prescriptions?.length ?? 0) > 0 && (
                        <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                          {v.prescriptions!.length} prescription{v.prescriptions!.length !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}
        </div>

        {/* ─── RIGHT PANEL ─── */}
        <div className={`w-full lg:flex-1 lg:min-w-0 space-y-5 ${mobilePanel === 'history' ? 'hidden lg:block' : 'block'}`}>
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
                <Textarea
                  value={consult.complaint}
                  onChange={(e) => setConsult((c) => ({ ...c, complaint: e.target.value }))}
                  placeholder="Patient's main complaint…"
                  disabled={isClosed || !isDoctor}
                  style={{ minHeight: '4rem', ...((!isDoctor || isClosed) ? { opacity: 0.7 } : {}) }}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Diagnosis">
                  <Textarea
                    value={consult.diagnosis}
                    onChange={(e) => setConsult((c) => ({ ...c, diagnosis: e.target.value }))}
                    placeholder="Clinical diagnosis…"
                    disabled={isClosed || !isDoctor}
                    style={{ minHeight: '4rem', ...((!isDoctor || isClosed) ? { opacity: 0.7 } : {}) }}
                  />
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
                <Textarea
                  value={consult.notes}
                  onChange={(e) => setConsult((c) => ({ ...c, notes: e.target.value }))}
                  placeholder="Additional clinical notes, follow-up instructions…"
                  disabled={isClosed || !isDoctor}
                  style={{ minHeight: '5rem', ...((!isDoctor || isClosed) ? { opacity: 0.7 } : {}) }}
                />
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
                                (d.generic_name ?? '').toLowerCase().includes(lower)
                            ).slice(0, 8)
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
                            const label = [d.name, d.strength, d.form].filter(Boolean).join(' ')
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
                            const label = [d.name, d.strength, d.form].filter(Boolean).join(' ')
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
                                <span className="font-medium">{d.name}</span>
                                {(d.strength || d.form) && (
                                  <span className="ml-1.5 text-xs" style={{ color: '#64748B' }}>
                                    {[d.strength, d.form].filter(Boolean).join(' · ')}
                                  </span>
                                )}
                                {d.generic_name && (
                                  <span className="block text-xs" style={{ color: '#94A3B8' }}>{d.generic_name}</span>
                                )}
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
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => setShowLabOrder(true)}
                  disabled={isClosed}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                  style={{
                    background: labOrdered ? '#DCFCE7' : isClosed ? '#F1F5F9' : 'rgba(13,148,136,0.08)',
                    color: labOrdered ? '#15803D' : isClosed ? '#94A3B8' : '#0D9488',
                    border: `1px solid ${labOrdered ? '#BBF7D0' : isClosed ? '#E2E8F0' : 'rgba(13,148,136,0.2)'}`,
                    cursor: isClosed ? 'not-allowed' : 'pointer',
                  }}
                >
                  <FlaskConical className="w-4 h-4" />
                  {labOrdered ? 'Lab Tests Ordered ✓' : 'Order Lab Tests'}
                  {labCatalog.length === 0 && !labOrdered && (
                    <span className="text-xs opacity-60">(catalog empty)</span>
                  )}
                </button>
                <button
                  onClick={() => setShowRadOrder(true)}
                  disabled={isClosed}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                  style={{
                    background: radOrdered ? '#DBEAFE' : isClosed ? '#F1F5F9' : 'rgba(29,78,216,0.06)',
                    color: radOrdered ? '#1D4ED8' : isClosed ? '#94A3B8' : '#1D4ED8',
                    border: `1px solid ${radOrdered ? '#BFDBFE' : isClosed ? '#E2E8F0' : 'rgba(29,78,216,0.15)'}`,
                    cursor: isClosed ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Scan className="w-4 h-4" />
                  {radOrdered ? 'Imaging Ordered ✓' : 'Order Imaging'}
                  {radiologyCatalog.length === 0 && !radOrdered && (
                    <span className="text-xs opacity-60">(catalog empty)</span>
                  )}
                </button>
              </div>
              {(labCatalog.length === 0 || radiologyCatalog.length === 0) && !isClosed && (
                <p className="mt-3 text-xs" style={{ color: '#94A3B8' }}>
                  Ask an admin to add tests to the catalog before ordering.
                </p>
              )}
            </GlassCard>
          )}

          {/* Close Visit */}
          {!isClosed && isDoctor && (
            <div className="flex justify-end">
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
    </div>
  )
}
