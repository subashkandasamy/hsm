'use client'

import { useState, useEffect, useCallback } from 'react'
import { UserPlus, Stethoscope, X } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import DateText from '@/components/ui/DateText'
import {
  listCareTeam, addCareTeamDoctor, removeCareTeamDoctor,
  listDoctorVisits, requestConsult, logVisit, completeVisit, cancelVisit,
} from '@/app/actions/careTeam'
import type { CareTeamMember, DoctorVisit, Profile } from '@/lib/types'

const ROLES = ['consultant', 'anaesthetist', 'physiotherapist', 'dietitian', 'psychiatrist', 'other'] as const
const ROLE_LABELS: Record<string, string> = {
  attending: 'Attending', consultant: 'Consultant', anaesthetist: 'Anaesthetist',
  physiotherapist: 'Physiotherapist', dietitian: 'Dietitian', psychiatrist: 'Psychiatrist', other: 'Other',
}
const BILLING_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  billed:   { bg: '#DCFCE7', color: '#15803D', label: 'Billed' },
  waived:   { bg: '#F1F5F9', color: '#64748B', label: 'No charge' },
  unbilled: { bg: '#FEF3C7', color: '#B45309', label: 'Unbilled' },
}

interface Props {
  admissionId: string
  doctors: Pick<Profile, 'id' | 'full_name'>[]
  canWrite: boolean
}

export default function CareTeamPanel({ admissionId, doctors, canWrite }: Props) {
  const [team, setTeam] = useState<CareTeamMember[]>([])
  const [visits, setVisits] = useState<DoctorVisit[]>([])
  const [mode, setMode] = useState<'none' | 'add' | 'request' | 'log'>('none')
  const [docId, setDocId] = useState(''); const [role, setRole] = useState<string>('consultant')
  const [visitType, setVisitType] = useState('round'); const [reason, setReason] = useState(''); const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null)
  const [completing, setCompleting] = useState<string | null>(null); const [completeNote, setCompleteNote] = useState('')

  const load = useCallback(() => {
    Promise.all([listCareTeam(admissionId), listDoctorVisits(admissionId)]).then(([t, v]) => { setTeam(t); setVisits(v) })
  }, [admissionId])
  useEffect(() => { load() }, [load])

  const teamDocIds = new Set(team.map((m) => m.doctor_id))
  const addable = doctors.filter((d) => mode === 'log' ? teamDocIds.has(d.id) : !teamDocIds.has(d.id))

  function reset() { setMode('none'); setDocId(''); setRole('consultant'); setVisitType('round'); setReason(''); setNote(''); setErr(null) }

  async function submit() {
    if (!docId && mode !== 'log') { setErr('Select a doctor'); return }
    if (mode === 'log' && !docId) { setErr('Select a care-team doctor'); return }
    setBusy(true); setErr(null)
    let res
    if (mode === 'add') res = await addCareTeamDoctor(admissionId, { doctor_id: docId, role })
    else if (mode === 'request') res = await requestConsult(admissionId, { doctor_id: docId, role, reason: reason || null })
    else res = await logVisit(admissionId, { doctor_id: docId, visit_type: visitType, note: note || null })
    setBusy(false)
    if (!res.success) { setErr(res.error); return }
    reset(); load()
  }

  async function remove(id: string) { await removeCareTeamDoctor(id); load() }
  async function cancel(id: string) { await cancelVisit(id); load() }
  async function complete(id: string) {
    setBusy(true)
    const res = await completeVisit(id, { note: completeNote || null })
    setBusy(false)
    if (res.success) { setCompleting(null); setCompleteNote(''); load() }
  }

  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Stethoscope className="w-4 h-4" style={{ color: '#0D9488' }} />
        <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Care Team & Doctor Visits</h3>
      </div>

      {/* Team chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {team.length === 0 && <span className="text-xs" style={{ color: '#94A3B8' }}>Only the attending doctor so far.</span>}
        {team.map((m) => (
          <span key={m.id} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium"
            style={{ background: 'rgba(13,148,136,0.08)', color: '#0F766E', border: '1px solid rgba(13,148,136,0.2)' }}>
            {m.doctor?.full_name ?? '—'}
            <span style={{ color: '#94A3B8' }}>· {ROLE_LABELS[m.role] ?? m.role}</span>
            {canWrite && m.role !== 'attending' && (
              <button onClick={() => remove(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 0 }}>
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
      </div>

      {/* Action buttons */}
      {canWrite && mode === 'none' && (
        <div className="flex gap-2 mb-3">
          {([['add', 'Add Doctor'], ['request', 'Request Consult'], ['log', 'Log Visit']] as const).map(([m, label]) => (
            <button key={m} onClick={() => { reset(); setMode(m) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
              <UserPlus className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      )}

      {/* Inline form */}
      {canWrite && mode !== 'none' && (
        <div className="rounded-xl p-3 mb-3 space-y-2" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
          <div className="grid grid-cols-2 gap-2">
            <Select value={docId} onChange={(e) => setDocId(e.target.value)}>
              <option value="">{mode === 'log' ? '— Care-team doctor —' : '— Select doctor —'}</option>
              {addable.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </Select>
            {mode !== 'log' ? (
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
            ) : (
              <Select value={visitType} onChange={(e) => setVisitType(e.target.value)}>
                <option value="round">Round</option><option value="consult">Consult</option><option value="procedure">Procedure</option>
              </Select>
            )}
          </div>
          {mode === 'request' && <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for consult" />}
          {mode === 'log' && <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visit note (optional)" />}
          {err && <p className="text-xs font-medium" style={{ color: '#DC2626' }}>{err}</p>}
          <p className="text-xs" style={{ color: '#94A3B8' }}>
            {mode === 'add' && 'Adds the doctor to the care team.'}
            {mode === 'request' && 'Creates a pending consult in the doctor’s worklist; billed on completion.'}
            {mode === 'log' && 'Records a completed visit; consultants are billed at their consultation fee.'}
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={reset} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>Cancel</button>
            <button onClick={submit} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: busy ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
              {busy ? '…' : mode === 'add' ? 'Add' : mode === 'request' ? 'Request' : 'Log Visit'}
            </button>
          </div>
        </div>
      )}

      {/* Visits list */}
      {visits.length > 0 && (
        <div className="space-y-1.5">
          {visits.map((v) => (
            <div key={v.id} className="rounded-xl px-3 py-2" style={{ background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium" style={{ color: '#0F172A' }}>{v.doctor?.full_name ?? '—'}</span>
                <span className="text-xs capitalize" style={{ color: '#64748B' }}>{v.visit_type}</span>
                {v.status === 'requested' && <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: '#FEF3C7', color: '#B45309' }}>Pending</span>}
                {v.status === 'cancelled' && <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: '#F1F5F9', color: '#94A3B8' }}>Cancelled</span>}
                {v.status === 'completed' && BILLING_STYLE[v.billing_status] && (
                  <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: BILLING_STYLE[v.billing_status].bg, color: BILLING_STYLE[v.billing_status].color }}>
                    {BILLING_STYLE[v.billing_status].label}{v.fee_snapshot ? ` ₹${v.fee_snapshot}` : ''}
                  </span>
                )}
                <span className="text-xs ml-auto" style={{ color: '#94A3B8' }}><DateText date={v.visit_date} /></span>
              </div>
              {v.reason && <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Reason: {v.reason}</p>}
              {v.note && <p className="text-xs mt-0.5" style={{ color: '#475569' }}>{v.note}</p>}
              {canWrite && v.status === 'requested' && (
                completing === v.id ? (
                  <div className="mt-1.5 flex gap-2">
                    <Input value={completeNote} onChange={(e) => setCompleteNote(e.target.value)} placeholder="Consult note" />
                    <button onClick={() => complete(v.id)} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>Save</button>
                  </div>
                ) : (
                  <div className="mt-1.5 flex gap-2">
                    <button onClick={() => { setCompleting(v.id); setCompleteNote('') }} className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>Complete</button>
                    <button onClick={() => cancel(v.id)} className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', cursor: 'pointer' }}>Cancel</button>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  )
}
