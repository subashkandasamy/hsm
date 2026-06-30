'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, User, BedDouble, Calendar, Clock, FileText,
  Plus, ArrowRightLeft, LogOut, Activity, Lock, Receipt,
} from 'lucide-react'
import Link from 'next/link'
import GlassCard from '@/components/ui/GlassCard'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import { addProgressNote, transferBed, dischargePatient } from '@/app/actions/ipd'
import BillBuilderModal from '@/app/(dashboard)/billing/_components/BillBuilderModal'
import FinancialPanel from './FinancialPanel'
import type { Admission, IpdProgressNote, Vitals, AdmissionFinancials, AdmissionAdvance, ProcedureTariff } from '@/lib/types'

function daysAdmitted(admittedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(admittedAt).getTime()) / 86400000))
}

interface WardOption {
  id: string
  name: string
  availableBeds: { id: string; bed_no: string }[]
}

interface Props {
  admission: Admission
  initialNotes: IpdProgressNote[]
  availableWards: WardOption[]
  financials: AdmissionFinancials
  initialAdvances: AdmissionAdvance[]
  procedureTariffs: ProcedureTariff[]
}

export default function AdmissionDetail({
  admission, initialNotes, availableWards,
  financials, initialAdvances, procedureTariffs,
}: Props) {
  const router = useRouter()
  const { profile } = useAuth()
  const canWrite   = profile && hasPermission(profile.role, 'ipd:write')
  const canNote    = profile && hasPermission(profile.role, 'ipd:notes')
  const canAdvance = profile && hasPermission(profile.role, 'billing:advance')

  const [notes, setNotes] = useState<IpdProgressNote[]>(initialNotes)
  const [adm, setAdm] = useState(admission)

  // Progress note form
  const [note, setNote] = useState('')
  const [vitals, setVitals] = useState<Vitals>({})
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  // Transfer
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferWardId, setTransferWardId] = useState('')
  const [transferBedId, setTransferBedId] = useState('')
  const [transferBeds, setTransferBeds] = useState<{ id: string; bed_no: string }[]>([])
  const [transferring, setTransferring] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)

  // Discharge
  const [showDischarge, setShowDischarge] = useState(false)
  const [summary, setSummary] = useState('')
  const [discharging, setDischarging] = useState(false)
  const [dischargeError, setDischargeError] = useState<string | null>(null)
  const [showBillingPrompt, setShowBillingPrompt] = useState(false)
  const [showBillBuilder, setShowBillBuilder] = useState(false)

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

  async function handleDischarge() {
    if (!summary.trim()) { setDischargeError('Discharge summary is required'); return }
    setDischarging(true)
    setDischargeError(null)
    const result = await dischargePatient(adm.id, { discharge_summary: summary })
    setDischarging(false)
    if (!result.success) { setDischargeError(result.error); return }
    setAdm((a) => ({ ...a, status: 'discharged', discharged_at: new Date().toISOString(), discharge_summary: summary }))
    setShowDischarge(false)
    setShowBillingPrompt(true)
  }

  const isClosed = adm.status !== 'admitted'
  const days = daysAdmitted(adm.admitted_at)

  return (
    <div>
      <Link href="/ipd" className="inline-flex items-center gap-1.5 text-sm mb-4"
        style={{ color: '#64748B' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#0D9488' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B' }}>
        <ArrowLeft className="w-4 h-4" /> Back to IPD
      </Link>

      {/* Header card */}
      <GlassCard className="p-5 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)' }}>
              <User className="w-6 h-6" style={{ color: '#0D9488' }} />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <Link href={`/patients/${adm.patient_id}`} className="text-lg font-bold hover:underline"
                  style={{ color: '#0F172A' }}>
                  {adm.patient?.full_name ?? '—'}
                </Link>
                <span className="font-mono text-xs px-2 py-0.5 rounded-lg"
                  style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>
                  {adm.patient?.uhid}
                </span>
                <StatusBadge
                  status={adm.status === 'admitted' ? 'active' : adm.status === 'discharged' ? 'success' : 'pending'}
                  label={adm.status}
                />
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-sm flex-wrap" style={{ color: '#475569' }}>
                <span className="flex items-center gap-1">
                  <BedDouble className="w-3.5 h-3.5" />
                  {adm.ward?.name} — Bed {adm.bed?.bed_no}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Admitted <DateText date={adm.admitted_at} />
                </span>
                {adm.status === 'admitted' && (
                  <span className="flex items-center gap-1 font-semibold" style={{ color: '#0D9488' }}>
                    <Clock className="w-3.5 h-3.5" />
                    Day {days}
                  </span>
                )}
                {adm.status === 'discharged' && adm.discharged_at && (
                  <span className="flex items-center gap-1">
                    <LogOut className="w-3.5 h-3.5" />
                    Discharged <DateText date={adm.discharged_at} />
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

          {!isClosed && canWrite && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowTransfer(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
                style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', cursor: 'pointer' }}>
                <ArrowRightLeft className="w-4 h-4" /> Transfer
              </button>
              <button onClick={() => setShowDischarge(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
                style={{ background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#B91C1C' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#DC2626' }}>
                <LogOut className="w-4 h-4" /> Discharge
              </button>
            </div>
          )}
        </div>

        {adm.discharge_summary && (
          <div className="mt-4 p-3 rounded-xl text-sm"
            style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D' }}>
            <p className="font-semibold mb-1">Discharge Summary</p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{adm.discharge_summary}</p>
          </div>
        )}
      </GlassCard>

      <div className="grid grid-cols-5 gap-5 items-start">
        {/* Progress notes */}
        <div className="col-span-3 space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
            <FileText className="w-4 h-4" style={{ color: '#0D9488' }} />
            Progress Notes
          </h3>

          {/* Add note form */}
          {!isClosed && canNote && (
            <GlassCard className="p-4">
              <form onSubmit={handleAddNote} className="space-y-3">
                <FormField label="Note">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Clinical note, observations, plan…" style={{ minHeight: '4rem' }} />
                </FormField>
                <div className="grid grid-cols-4 gap-2">
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
                  <span className="text-xs" style={{ color: '#94A3B8' }}><DateText date={n.created_at} /></span>
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

        {/* Right column: Patient info + Financial panel */}
        <div className="col-span-2 space-y-4">
          {/* Financial Summary Panel (Phase 15) */}
          <FinancialPanel
            admissionId={adm.id}
            initialFinancials={financials}
            initialAdvances={initialAdvances}
            canAdvance={!!canAdvance}
            procedureTariffs={procedureTariffs}
            wardId={adm.ward_id}
          />

          <GlassCard className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>
              Patient Details
            </p>
            <div className="space-y-2 text-sm">
              {adm.patient?.blood_group && (
                <div className="flex justify-between">
                  <span style={{ color: '#64748B' }}>Blood Group</span>
                  <span className="font-semibold px-2 py-0.5 rounded-lg"
                    style={{ background: '#FEE2E2', color: '#DC2626' }}>
                    {adm.patient.blood_group}
                  </span>
                </div>
              )}
              {adm.patient?.allergies && (
                <div>
                  <span className="text-xs font-semibold" style={{ color: '#B45309' }}>Allergies</span>
                  <p className="text-xs mt-0.5 p-2 rounded-lg"
                    style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                    {adm.patient.allergies}
                  </p>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: '#64748B' }}>Attending</span>
                <span style={{ color: '#0F172A' }}>{adm.doctor?.full_name ?? '—'}</span>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Transfer modal */}
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

      {/* Post-discharge billing prompt */}
      {showBillingPrompt && (
        <div className="rounded-xl p-4 mb-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
          <div className="flex items-center gap-3">
            <Receipt className="w-5 h-5 flex-shrink-0" style={{ color: '#15803D' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#15803D' }}>Patient discharged</p>
              <p className="text-xs mt-0.5" style={{ color: '#16A34A' }}>
                This admission may have unbilled charges. Generate a bill now?
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setShowBillBuilder(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
              style={{ background: '#15803D', color: '#fff', border: 'none' }}
            >
              <Receipt className="w-4 h-4" /> Generate Bill
            </button>
            <button
              onClick={() => setShowBillingPrompt(false)}
              className="px-3 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}
            >
              Later
            </button>
          </div>
        </div>
      )}

      {/* Discharge modal */}
      <Modal open={showDischarge} onClose={() => setShowDischarge(false)} title="Discharge Patient" maxWidth="30rem">
        <div className="space-y-4">
          <FormField label="Discharge Summary" required>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)}
              placeholder="Condition at discharge, treatment given, follow-up instructions…"
              style={{ minHeight: '7rem' }} />
          </FormField>
          {dischargeError && <p className="text-sm" style={{ color: '#DC2626' }}>{dischargeError}</p>}
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowDischarge(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
              Cancel
            </button>
            <button onClick={handleDischarge} disabled={discharging || !summary.trim()}
              className="px-5 py-2 rounded-xl text-sm font-semibold"
              style={{
                background: (discharging || !summary.trim()) ? '#94A3B8' : '#DC2626',
                color: '#fff', border: 'none',
                cursor: (discharging || !summary.trim()) ? 'not-allowed' : 'pointer',
              }}>
              {discharging ? 'Discharging…' : 'Discharge Patient'}
            </button>
          </div>
        </div>
      </Modal>

      {showBillBuilder && adm.patient && (
        <BillBuilderModal
          preselectedPatient={adm.patient}
          onClose={() => setShowBillBuilder(false)}
          onGenerated={(billId) => {
            setShowBillBuilder(false)
            setShowBillingPrompt(false)
            router.push(`/billing/${billId}`)
          }}
        />
      )}
    </div>
  )
}
