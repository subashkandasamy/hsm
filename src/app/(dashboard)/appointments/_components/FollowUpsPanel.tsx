'use client'

import { useState, useEffect, useCallback } from 'react'
import { CalendarClock, Plus, Search, Check, X, ArrowRight } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import EmptyState from '@/components/ui/EmptyState'
import { listFollowUps, convertFollowUp, cancelFollowUp, createFollowUp } from '@/app/actions/followUps'
import { searchPatients } from '@/app/actions/patients'
import type { FollowUp, Patient } from '@/lib/types'
import { istToday } from '@/lib/istDate'
import { doctorName } from '@/lib/doctors'

interface Doctor { id: string; full_name: string; role: string }
type StatusFilter = 'pending' | 'converted' | 'cancelled' | 'all'

const TODAY = () => istToday()

const SOURCE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  opd:    { label: 'OPD',    bg: '#E0F2F1', color: '#0F766E' },
  ipd:    { label: 'IPD',    bg: '#EDE9FE', color: '#6D28D9' },
  manual: { label: 'Manual', bg: '#F1F5F9', color: '#475569' },
}

export default function FollowUpsPanel({ doctors }: { doctors: Doctor[] }) {
  const [items, setItems] = useState<FollowUp[]>([])
  const [status, setStatus] = useState<StatusFilter>('pending')
  const [doctorFilter, setDoctorFilter] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [convertId, setConvertId] = useState<string | null>(null)
  const [convDoctor, setConvDoctor] = useState('')
  const [convDate, setConvDate] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await listFollowUps({ status, doctorId: doctorFilter || undefined, overdueOnly })
    setItems(data)
    setLoading(false)
  }, [status, doctorFilter, overdueOnly])

  useEffect(() => { load() }, [load])

  function startConvert(fu: FollowUp) {
    setConvertId(fu.id)
    setConvDoctor(fu.suggested_doctor_id ?? '')
    setConvDate(fu.suggested_date ?? TODAY())
    setError(null)
  }

  async function doConvert(fu: FollowUp) {
    if (!convDoctor) { setError('Pick a doctor'); return }
    if (!convDate) { setError('Pick a date'); return }
    setBusy(fu.id); setError(null)
    const res = await convertFollowUp(fu.id, {
      doctor_id: convDoctor,
      scheduled_at: `${convDate}T10:00:00`,
    })
    setBusy(null)
    if (!res.success) { setError(res.error); return }
    setConvertId(null)
    load()
  }

  async function doCancel(fu: FollowUp) {
    setBusy(fu.id); setError(null)
    const res = await cancelFollowUp(fu.id)
    setBusy(null)
    if (!res.success) { setError(res.error); return }
    load()
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap mb-5">
        <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="w-full sm:w-44">
          <option value="pending">Pending</option>
          <option value="converted">Converted</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </Select>
        <Select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className="w-full sm:w-48">
          <option value="">All Doctors</option>
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}>
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          Overdue only
        </label>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold sm:ml-auto"
          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <Plus className="w-4 h-4" /> New Follow-up
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between"
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontWeight: 600, fontSize: 16 }}>×</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm" style={{ color: '#94A3B8' }}>Loading…</div>
      ) : items.length === 0 ? (
        <GlassCard>
          <EmptyState title="No follow-ups" description="Follow-ups recommended by doctors appear here for the front desk to confirm and book." />
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((fu) => {
            const badge = SOURCE_BADGE[fu.source] ?? SOURCE_BADGE.manual
            const overdue = fu.status === 'pending' && !!fu.suggested_date && fu.suggested_date < TODAY()
            const converting = convertId === fu.id
            return (
              <GlassCard key={fu.id} className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-[12rem]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>{fu.patient?.full_name ?? 'Patient'}</span>
                      {fu.patient?.uhid && <span className="text-xs" style={{ color: '#94A3B8' }}>{fu.patient.uhid}</span>}
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                        style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                      {overdue && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                          style={{ background: '#FEE2E2', color: '#B91C1C' }}>Overdue</span>
                      )}
                    </div>
                    <p className="text-xs mt-1" style={{ color: '#64748B' }}>
                      {fu.suggested_date && <>Suggested <strong style={{ color: overdue ? '#B91C1C' : '#475569' }}>{fu.suggested_date}</strong>{' · '}</>}
                      {fu.suggested_doctor?.full_name ? `Dr ${fu.suggested_doctor.full_name}` : 'No doctor set'}
                      {fu.recommender?.full_name && fu.source !== 'manual' && <> · rec. by {doctorName(fu.recommender.full_name)}</>}
                    </p>
                    {fu.reason && <p className="text-xs mt-1" style={{ color: '#475569' }}>{fu.reason}</p>}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {fu.status === 'pending' ? (
                      <>
                        <button onClick={() => converting ? setConvertId(null) : startConvert(fu)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold"
                          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                          <ArrowRight className="w-3.5 h-3.5" /> Convert
                        </button>
                        <button onClick={() => doCancel(fu)} disabled={busy === fu.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                          style={{ background: '#F1F5F9', color: '#B91C1C', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                          <X className="w-3.5 h-3.5" /> Cancel
                        </button>
                      </>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={fu.status === 'converted'
                          ? { background: '#DCFCE7', color: '#15803D' }
                          : { background: '#FEE2E2', color: '#B91C1C' }}>
                        {fu.status === 'converted' ? 'Booked' : 'Cancelled'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Inline convert form */}
                {converting && (
                  <div className="flex flex-wrap items-end gap-2 mt-3 pt-3" style={{ borderTop: '1px solid #E2E8F0' }}>
                    <div className="w-full sm:w-48">
                      <label className="text-xs block mb-1" style={{ color: '#94A3B8' }}>Doctor</label>
                      <Select value={convDoctor} onChange={(e) => setConvDoctor(e.target.value)}>
                        <option value="">Select doctor</option>
                        {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                      </Select>
                    </div>
                    <div className="w-full sm:w-44">
                      <label className="text-xs block mb-1" style={{ color: '#94A3B8' }}>Appointment date</label>
                      <Input type="date" value={convDate} min={TODAY()} onChange={(e) => setConvDate(e.target.value)} />
                    </div>
                    <button onClick={() => doConvert(fu)} disabled={busy === fu.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
                      style={{ background: busy === fu.id ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                      <Check className="w-4 h-4" /> {busy === fu.id ? 'Booking…' : 'Book Appointment'}
                    </button>
                    <p className="text-xs w-full sm:w-auto" style={{ color: '#94A3B8' }}>Booking raises the consultation bill, as usual.</p>
                  </div>
                )}
              </GlassCard>
            )
          })}
        </div>
      )}

      {showNew && (
        <NewFollowUpModal doctors={doctors} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load() }} />
      )}
    </div>
  )
}

// ── Manual follow-up create modal ─────────────────────────────────────────────
function NewFollowUpModal({ doctors, onClose, onCreated }: { doctors: Doctor[]; onClose: () => void; onCreated: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [showDrop, setShowDrop] = useState(false)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [doctorId, setDoctorId] = useState('')
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setResults(await searchPatients(q))
  }, [])
  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  async function submit() {
    if (!patient) { setError('Select a patient'); return }
    setSaving(true); setError(null)
    const res = await createFollowUp({
      patient_id: patient.id,
      source: 'manual',
      suggested_doctor_id: doctorId || null,
      suggested_date: date || null,
      reason: reason.trim() || null,
    })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    onCreated()
  }

  return (
    <Modal open onClose={onClose} title="New Follow-up">
      <div className="flex flex-col gap-3">
        <FormField label="Patient" htmlFor="fu-patient" required error={!patient && error ? error : undefined}>
          {patient ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: '#F0FDFA', border: '1px solid #99F6E4' }}>
              <span className="text-sm font-medium" style={{ color: '#0F172A' }}>{patient.full_name} <span style={{ color: '#94A3B8' }}>{patient.uhid}</span></span>
              <button onClick={() => { setPatient(null); setQuery('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0D9488', fontSize: 12, fontWeight: 600 }}>Change</button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
              <input id="fu-patient" value={query}
                onChange={(e) => { setQuery(e.target.value); setShowDrop(true) }}
                onFocus={() => setShowDrop(results.length > 0)}
                placeholder="Search patient by name or phone…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
                style={{ background: '#fff', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }} />
              {showDrop && results.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-xl overflow-hidden max-h-56 overflow-y-auto"
                  style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
                  {results.map((p) => (
                    <button key={p.id} onClick={() => { setPatient(p); setShowDrop(false) }}
                      className="w-full text-left px-3 py-2.5 text-sm"
                      style={{ background: 'none', border: 'none', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', color: '#0F172A' }}>
                      {p.full_name} <span style={{ color: '#94A3B8' }}>· {p.uhid} · {p.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </FormField>

        <FormField label="Doctor (optional)" htmlFor="fu-doctor">
          <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            <option value="">No doctor set</option>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </Select>
        </FormField>

        <FormField label="Suggested date (optional)" htmlFor="fu-date">
          <Input id="fu-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>

        <FormField label="Reason (optional)" htmlFor="fu-reason">
          <Input id="fu-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Review reports, BP check…" />
        </FormField>

        {error && patient && <p className="text-xs font-medium" style={{ color: '#DC2626' }}>{error}</p>}

        <div className="flex justify-end gap-2 mt-1">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium" style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Create Follow-up'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
