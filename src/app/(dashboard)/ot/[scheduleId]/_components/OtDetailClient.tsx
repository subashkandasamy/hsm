'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, Plus, Trash2, Search, UserPlus, X, Scissors, BedDouble, Printer } from 'lucide-react'
import { useDrugSearch } from '@/lib/hooks/useDrugSearch'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import SpeechTextarea from '@/components/ui/SpeechTextarea'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import StatusBadge from '@/components/ui/StatusBadge'
import Money from '@/components/ui/Money'
import {
  setOtStatus, saveOtNotes, addConsumable, removeConsumable, cancelSurgery,
  addOtTeamMember, removeOtTeamMember, searchOtStaff, saveSurgeryFees,
} from '@/app/actions/ot'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { missingFromRecord } from '@/lib/surgery'
import SurgeryRecordPanel from './SurgeryRecordPanel'
import { postOpTransferToWard } from '@/app/actions/ipd'
import { listAvailableBeds } from '@/app/actions/wards'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type { OtSchedule, OtConsumable, OtTeamMember, OtTeamRole, Profile, Drug, WardWithBeds, Bed } from '@/lib/types'

const STATUS_MAP: Record<string, string> = {
  scheduled: 'pending', in_progress: 'info', completed: 'success', cancelled: 'cancelled',
}

const TEAM_ROLES: { value: OtTeamRole; label: string }[] = [
  { value: 'surgeon',      label: 'Surgeon' },
  { value: 'assistant',    label: 'Asst. Surgeon' },
  { value: 'anaesthetist', label: 'Anaesthetist' },
  { value: 'scrub_nurse',  label: 'Scrub Nurse' },
  { value: 'other',        label: 'Other' },
]

const ROLE_COLORS: Record<OtTeamRole, { bg: string; text: string; border: string }> = {
  surgeon:      { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  assistant:    { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
  anaesthetist: { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' },
  scrub_nurse:  { bg: '#FAF5FF', text: '#7C3AED', border: '#E9D5FF' },
  other:        { bg: '#F1F5F9', text: '#475569', border: '#E2E8F0' },
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

interface Props {
  schedule: OtSchedule
  wardBoard: WardWithBeds[]
}

export default function OtDetailClient({ schedule: initial, wardBoard }: Props) {
  const router = useRouter()
  const { profile } = useAuth()
  const canRecord   = !!profile && hasPermission(profile.role, 'ot:record', profile.granted_permissions)
  const canSchedule = !!profile && hasPermission(profile.role, 'ot:schedule', profile.granted_permissions)

  const [schedule, setSchedule] = useState(initial)
  const [team, setTeam]         = useState<OtTeamMember[]>(initial.team_members ?? [])
  const [consumables, setConsumables] = useState<OtConsumable[]>(initial.consumables ?? [])
  const [notes, setNotes]       = useState(initial.notes ?? '')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteSaved, setNoteSaved]   = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Post-op ward transfer
  const [showTransfer, setShowTransfer] = useState(false)
  const needsTransfer =
    schedule.status === 'completed' &&
    !!schedule.admission_id &&
    (schedule.admission?.direct_ot === true || schedule.admission?.ward?.is_temp === true)

  const wardOptions = wardBoard.map(w => ({
    id: w.id, name: w.name, is_temp: w.is_temp,
    availableBeds: w.beds.filter(b => b.status === 'available'),
  }))

  // Team add form — search-as-you-type
  const [staffQuery, setStaffQuery]               = useState('')
  const [staffResults, setStaffResults]           = useState<Pick<Profile, 'id' | 'full_name' | 'role'>[]>([])
  const [showStaffDrop, setShowStaffDrop]         = useState(false)
  const [selectedStaff, setSelectedStaff]         = useState<Pick<Profile, 'id' | 'full_name' | 'role'> | null>(null)
  const [addMemberRole, setAddMemberRole]         = useState<OtTeamRole>('assistant')
  const [addingMember, setAddingMember]           = useState(false)


  // Consumable drug picker
  const [drugQuery, setDrugQuery]               = useState('')
  const [showDrugDrop, setShowDrugDrop]         = useState(false)
  const [newDesc, setNewDesc]                   = useState('')
  const [newQty, setNewQty]                     = useState('1')
  const [addingC, setAddingC]                   = useState(false)
  const [selectedDrugId, setSelectedDrugId]     = useState<string | null>(null)
  const [selectedDrugIsGlobal, setSelectedDrugIsGlobal] = useState(false)

  // Implant details for the item being added
  const [isImplant, setIsImplant]   = useState(false)
  const [implantLot, setImplantLot] = useState('')
  const [implantMaker, setImplantMaker] = useState('')
  const [implantSize, setImplantSize]   = useState('')
  const [consumableError, setConsumableError] = useState<string | null>(null)

  // Cancel (in-page dialog, never the browser's) and "complete anyway"
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [completeWarning, setCompleteWarning] = useState<string[] | null>(null)

  // Doctors' fees, billed as their own lines at completion
  const [fees, setFees] = useState({
    surgeon: initial.surgeon_fee != null ? String(initial.surgeon_fee) : '',
    anaesthetist: initial.anaesthetist_fee != null ? String(initial.anaesthetist_fee) : '',
    team: Object.fromEntries((initial.team_members ?? []).map((m) => [m.id, m.fee != null ? String(m.fee) : ''])) as Record<string, string>,
  })
  const [feesSaving, setFeesSaving] = useState(false)
  const [feesMsg, setFeesMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const isClosed = schedule.status === 'completed' || schedule.status === 'cancelled'
  // The record (and the free notes) stay open after completion — the operation
  // note is often written once the patient is out. Never on a cancelled surgery.
  const recordEditable = canRecord && schedule.status !== 'cancelled'
  const feesEditable = canSchedule && schedule.status !== 'cancelled' && schedule.billing_status !== 'billed'


  // Debounced staff search
  useEffect(() => {
    if (!staffQuery.trim()) { setStaffResults([]); return }
    const t = setTimeout(async () => {
      const results = await searchOtStaff(staffQuery)
      // exclude surgeon and already-added members
      setStaffResults(results.filter(s =>
        s.id !== schedule.surgeon_id && !team.some(m => m.profile_id === s.id)
      ))
      setShowStaffDrop(true)
    }, 300)
    return () => clearTimeout(t)
  }, [staffQuery, schedule.surgeon_id, team])

  const filteredDrugs = useDrugSearch(drugQuery, 8)

  function selectDrug(drug: Drug) {
    const brandName = (drug.brand_aliases ?? [])[0]
    const primaryName = brandName ?? drug.name
    const label = [primaryName, drug.form, drug.strength].filter(Boolean).join(' ')
    setNewDesc(label); setDrugQuery(label); setShowDrugDrop(false)
    setSelectedDrugId(drug.id)
    setSelectedDrugIsGlobal(drug.is_global ?? false)
  }

  async function handleStatus(status: 'in_progress' | 'completed', force = false) {
    if (status === 'completed' && !force) {
      const missing = missingFromRecord(schedule)
      if (missing.length) { setCompleteWarning(missing); return }
    }
    setCompleteWarning(null)
    setActionLoading(true); setError(null)
    const r = await setOtStatus(schedule.id, status)
    setActionLoading(false)
    if (!r.success) { setError(r.error); return }
    setSchedule(s => ({ ...s, status }))
  }

  async function handleCancel() {
    setConfirmCancel(false)
    setActionLoading(true); setError(null)
    const r = await cancelSurgery(schedule.id)
    setActionLoading(false)
    if (!r.success) { setError(r.error); return }
    setSchedule(s => ({ ...s, status: 'cancelled' }))
  }


  async function handleSaveFees() {
    const num = (v: string) => (v.trim() === '' ? null : Number(v))
    const all = [fees.surgeon, fees.anaesthetist, ...Object.values(fees.team)]
    if (all.some((v) => v.trim() !== '' && !(Number(v) >= 0))) { setFeesMsg({ ok: false, text: 'Fees are amounts in rupees' }); return }
    setFeesSaving(true); setFeesMsg(null)
    const r = await saveSurgeryFees(schedule.id, {
      surgeon_fee: num(fees.surgeon),
      anaesthetist_fee: schedule.anaesthetist_id ? num(fees.anaesthetist) : null,
      team: team.map((m) => ({ id: m.id, fee: num(fees.team[m.id] ?? '') })),
    })
    setFeesSaving(false)
    if (!r.success) { setFeesMsg({ ok: false, text: r.error }); return }
    setSchedule((s) => ({ ...s, surgeon_fee: num(fees.surgeon), anaesthetist_fee: num(fees.anaesthetist) }))
    setTeam((t) => t.map((m) => ({ ...m, fee: num(fees.team[m.id] ?? '') })))
    setFeesMsg({ ok: true, text: 'Fees saved — billed with the surgery when it is marked completed' })
  }

  async function handleSaveNotes() {
    setNoteSaving(true)
    await saveOtNotes(schedule.id, notes)
    setNoteSaving(false); setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2000)
  }

  async function handleAddMember() {
    if (!selectedStaff) return
    setAddingMember(true); setError(null)
    const r = await addOtTeamMember(schedule.id, selectedStaff.id, addMemberRole)
    setAddingMember(false)
    if (!r.success) { setError(r.error); return }
    setTeam(t => [...t, r.member])
    setSelectedStaff(null); setStaffQuery(''); setStaffResults([])
    setAddMemberRole('assistant')
  }

  async function handleRemoveMember(memberId: string) {
    await removeOtTeamMember(memberId)
    setTeam(t => t.filter(m => m.id !== memberId))
  }

  const handleAddConsumable = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDesc.trim()) return
    setAddingC(true); setConsumableError(null)
    const r = await addConsumable({
      ot_schedule_id:  schedule.id,
      description:     newDesc.trim(),
      qty:             parseInt(newQty, 10) || 1,
      drug_master_id:  selectedDrugId && selectedDrugIsGlobal  ? selectedDrugId : null,
      drug_id:         selectedDrugId && !selectedDrugIsGlobal ? selectedDrugId : null,
      is_implant:      isImplant,
      implant_lot_no:  isImplant ? implantLot : null,
      implant_maker:   isImplant ? implantMaker : null,
      implant_size:    isImplant ? implantSize : null,
    })
    setAddingC(false)
    if (!r.success) { setConsumableError(r.error); return }
    setConsumables(c => [...c, r.consumable])
    setNewDesc(''); setDrugQuery(''); setNewQty('1')
    setSelectedDrugId(null); setSelectedDrugIsGlobal(false)
    setIsImplant(false); setImplantLot(''); setImplantMaker(''); setImplantSize('')
  }, [schedule.id, newDesc, newQty, selectedDrugId, selectedDrugIsGlobal, isImplant, implantLot, implantMaker, implantSize])

  async function handleRemoveConsumable(id: string) {
    await removeConsumable(id)
    setConsumables(c => c.filter(x => x.id !== id))
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-10">

      {/* Back + title */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.push('/ot')}
          className="p-2 rounded-xl mt-0.5 flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
          <ArrowLeft className="w-4 h-4" style={{ color: '#64748B' }} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base font-bold" style={{ color: '#0F172A', wordBreak: 'break-word' }}>
              {schedule.procedure_name}
            </h1>
            <StatusBadge status={STATUS_MAP[schedule.status] ?? 'pending'}
              label={schedule.status.replace('_', ' ')} />
          </div>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
            {fmtDate(schedule.scheduled_start)} · {schedule.room?.name ?? '—'}
          </p>
        </div>
      </div>

      {error && (
        <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

      {/* Surgery summary — compact detail list */}
      <GlassCard style={{ overflow: 'hidden', padding: 0 }}>
        {/* Top strip: fee + total */}
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #F1F5F9', background: 'rgba(13,148,136,0.04)' }}>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold" style={{ color: '#0D9488' }}>
              <Money amount={schedule.price_snapshot} />
            </span>
            <span className="text-xs" style={{ color: '#94A3B8' }}>procedure fee</span>
          </div>
        </div>

        {/* Detail rows */}
        <dl className="divide-y divide-[#F1F5F9]">
          {([
            ['Patient',       `${schedule.patient?.full_name ?? '—'}  ·  ${schedule.patient?.uhid ?? ''}`],
            ['Date & Time',   `${fmtDate(schedule.scheduled_start)}  ·  ${fmtTime(schedule.scheduled_start)} – ${fmtTime(schedule.scheduled_end)}`],
            ['OT Room',       schedule.room?.name ?? '—'],
            ['Surgeon',       schedule.surgeon?.full_name ?? '—'],
            ['Anaesthetist',  schedule.anaesthetist?.full_name ?? '—'],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} className="flex items-baseline px-4 py-2.5 gap-3">
              <dt className="text-xs flex-shrink-0 w-24" style={{ color: '#94A3B8' }}>{label}</dt>
              <dd className="text-sm font-medium min-w-0 break-words" style={{ color: '#0F172A' }}>{value}</dd>
            </div>
          ))}

          {/* Location row — interactive */}
          <div className="flex items-center px-4 py-2.5 gap-3">
            <span className="text-xs flex-shrink-0 w-24" style={{ color: '#94A3B8' }}>Ward / Bed</span>
            <div className="flex items-center justify-between flex-1 min-w-0">
              {schedule.admission?.ward ? (
                <span className="text-sm font-medium" style={{ color: '#0F172A' }}>
                  {schedule.admission.ward.name}
                  {schedule.admission.ward.is_temp && (
                    <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: '#FEF3C7', color: '#B45309' }}>overflow</span>
                  )}
                  {schedule.admission.bed && (
                    <span style={{ color: '#64748B', fontWeight: 400 }}> · Bed {schedule.admission.bed.bed_no}</span>
                  )}
                </span>
              ) : schedule.admission?.direct_ot ? (
                <span className="text-sm" style={{ color: '#94A3B8' }}>No ward — direct OT</span>
              ) : (
                <span className="text-sm" style={{ color: '#94A3B8' }}>—</span>
              )}
              {needsTransfer && canRecord && (
                <button onClick={() => setShowTransfer(true)}
                  className="flex items-center gap-1 ml-3 px-2.5 py-1 rounded-lg text-xs font-semibold flex-shrink-0"
                  style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  <BedDouble className="w-3 h-3" />
                  {schedule.admission?.direct_ot ? 'Assign Ward' : 'Transfer'}
                </button>
              )}
            </div>
          </div>
        </dl>

        {/* Footer: IPD link */}
        {schedule.admission_id && (
          <div className="px-4 py-2.5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <a href={`/ipd/${schedule.admission_id}`}
              className="text-xs font-medium"
              style={{ color: '#0D9488', textDecoration: 'none' }}>
              ← View IPD Admission
            </a>
          </div>
        )}
      </GlassCard>

      {/* Print — operation record with write-in fields for the OT register */}
      <div className="flex justify-end">
        <a href={`/print/ot/${schedule.id}/pdf`} target="_blank" rel="noopener"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)' }}>
          <Printer className="w-4 h-4" /> Print operation record
        </a>
      </div>

      {/* Status actions */}
      {!isClosed && canRecord && (
        <div className="flex gap-3 flex-wrap">
          {schedule.status === 'scheduled' && (
            <button onClick={() => handleStatus('in_progress')} disabled={actionLoading}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-semibold text-center"
              style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', cursor: 'pointer' }}>
              Mark In Progress
            </button>
          )}
          {schedule.status === 'in_progress' && (
            <button onClick={() => handleStatus('completed')} disabled={actionLoading}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-semibold text-center"
              style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0', cursor: 'pointer' }}>
              Mark Completed
            </button>
          )}
          {canSchedule && schedule.status === 'scheduled' && (
            <button onClick={() => setConfirmCancel(true)} disabled={actionLoading}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-medium text-center"
              style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', cursor: 'pointer' }}>
              Cancel Surgery
            </button>
          )}
        </div>
      )}

      {completeWarning && (
        <div className="rounded-xl p-3.5" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <p className="text-sm font-semibold" style={{ color: '#92400E' }}>The record is not complete yet</p>
          <ul className="text-xs mt-1 list-disc pl-4 space-y-0.5" style={{ color: '#78350F' }}>
            {completeWarning.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <p className="text-xs mt-1.5" style={{ color: '#78350F' }}>You can complete now and fill these in afterwards — the record stays open.</p>
          <div className="flex gap-2 mt-2.5">
            <button onClick={() => handleStatus('completed', true)} disabled={actionLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: '#15803D', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Complete anyway
            </button>
            <button onClick={() => setCompleteWarning(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
              Fill the record first
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog open={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={handleCancel}
        title="Cancel this surgery?" confirmLabel="Cancel surgery" confirmVariant="danger" loading={actionLoading}
        description="The booking is cancelled and its pending consumables are withdrawn. This cannot be undone." />

      {/* Surgical Team */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Scissors className="w-4 h-4" style={{ color: '#0D9488' }} />
          <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Surgical Team</h2>
        </div>

        {/* Chips — opaque bg prevents bleeding through glass topbar when scrolled */}
        <div className="rounded-xl p-3 flex flex-wrap gap-2" style={{ background: '#F8FAFC' }}>
          {/* Primary surgeon */}
          <TeamChip name={schedule.surgeon?.full_name ?? '—'} role="surgeon" />
          {/* Primary anaesthetist */}
          {schedule.anaesthetist && (
            <TeamChip name={schedule.anaesthetist.full_name} role="anaesthetist" />
          )}
          {/* Additional members */}
          {team.map(member => (
            <TeamChip
              key={member.id}
              name={member.profile?.full_name ?? '—'}
              role={member.role}
              onRemove={(!isClosed && canRecord) ? () => handleRemoveMember(member.id) : undefined}
            />
          ))}
          {team.length === 0 && !schedule.anaesthetist && (
            <span className="text-xs" style={{ color: '#94A3B8' }}>No additional team members added yet</span>
          )}
        </div>

        {/* Add member — search as you type, works for 1000+ staff */}
        {!isClosed && canRecord && (
          <div className="mt-3 space-y-2" style={{ borderTop: '1px solid #F1F5F9', paddingTop: '0.75rem' }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
              <input
                type="text"
                value={staffQuery}
                onChange={e => { setStaffQuery(e.target.value); setSelectedStaff(null) }}
                onFocus={() => staffResults.length > 0 && setShowStaffDrop(true)}
                onBlur={() => setTimeout(() => setShowStaffDrop(false), 150)}
                placeholder="Search doctor or nurse to add…"
                style={{ width: '100%', padding: '0.625rem 0.875rem 0.625rem 2.25rem', borderRadius: '0.75rem', fontSize: '0.875rem', background: selectedStaff ? 'rgba(13,148,136,0.05)' : 'rgba(255,255,255,0.85)', border: selectedStaff ? '1px solid rgba(13,148,136,0.4)' : '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }}
              />
              {showStaffDrop && staffResults.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl overflow-hidden shadow-lg"
                  style={{ background: '#fff', border: '1px solid #E2E8F0', maxHeight: '10rem', overflowY: 'auto' }}>
                  {staffResults.map(s => (
                    <li key={s.id}>
                      <button type="button"
                        onMouseDown={() => {
                          setSelectedStaff(s)
                          setStaffQuery(s.full_name)
                          setShowStaffDrop(false)
                          if (s.role === 'nurse') setAddMemberRole('scrub_nurse')
                          else setAddMemberRole('assistant')
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm flex items-center justify-between"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(13,148,136,0.06)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                        <span className="font-medium" style={{ color: '#0F172A' }}>{s.full_name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded ml-2 flex-shrink-0"
                          style={{ background: '#F1F5F9', color: '#64748B' }}>{s.role}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {selectedStaff && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select value={addMemberRole} onChange={e => setAddMemberRole(e.target.value as OtTeamRole)}>
                    {TEAM_ROLES.filter(r => r.value !== 'surgeon').map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </Select>
                </div>
                <button onClick={handleAddMember} disabled={addingMember}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium flex-shrink-0"
                  style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  <UserPlus className="w-4 h-4" /> Add
                </button>
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* Doctors' fees — each billed as its own line when the surgery is completed */}
      <GlassCard className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Fees</h2>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
              {schedule.billing_status === 'billed'
                ? 'Billed — change a fee on the bill'
                : 'Each fee becomes its own bill line when the surgery is completed. Leave blank if the procedure price already includes it.'}
            </p>
          </div>
          {feesEditable && (
            <button onClick={handleSaveFees} disabled={feesSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: feesSaving ? 'wait' : 'pointer' }}>
              <Save className="w-3.5 h-3.5" /> {feesSaving ? 'Saving…' : 'Save fees'}
            </button>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span style={{ color: '#475569' }}>Procedure — {schedule.procedure_name}</span>
            <span className="font-semibold" style={{ color: '#0F172A' }}><Money amount={schedule.price_snapshot} /></span>
          </div>
          {([
            ['surgeon', `Surgeon — ${schedule.surgeon?.full_name ?? '—'}`, true],
            ['anaesthetist', `Anaesthetist — ${schedule.anaesthetist?.full_name ?? '—'}`, !!schedule.anaesthetist_id],
          ] as const).filter(([, , show]) => show).map(([k, label]) => (
            <div key={k} className="flex items-center justify-between gap-3 text-sm">
              <span style={{ color: '#475569' }}>{label}</span>
              <Input inputMode="decimal" value={fees[k]} disabled={!feesEditable} placeholder="₹ —"
                onChange={(e) => setFees((f) => ({ ...f, [k]: e.target.value }))} style={{ width: '8rem', textAlign: 'right' }} />
            </div>
          ))}
          {team.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 text-sm">
              <span style={{ color: '#475569' }}>{TEAM_ROLES.find((r) => r.value === m.role)?.label ?? m.role} — {m.profile?.full_name ?? '—'}</span>
              <Input inputMode="decimal" value={fees.team[m.id] ?? ''} disabled={!feesEditable} placeholder="₹ —"
                onChange={(e) => setFees((f) => ({ ...f, team: { ...f.team, [m.id]: e.target.value } }))} style={{ width: '8rem', textAlign: 'right' }} />
            </div>
          ))}
        </div>
        {feesMsg && <p className="text-xs mt-2" style={{ color: feesMsg.ok ? '#15803D' : '#DC2626' }}>{feesMsg.text}</p>}
      </GlassCard>

      {/* The surgery record: before surgery, WHO checklist, anaesthesia, operation note */}
      <SurgeryRecordPanel schedule={schedule} editable={recordEditable}
        onSaved={(patch) => setSchedule((s) => ({ ...s, ...patch }))} />

      {/* Other notes */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Other notes</h2>
          {recordEditable && (
            <button onClick={handleSaveNotes} disabled={noteSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: noteSaved ? '#DCFCE7' : '#0D9488', color: noteSaved ? '#15803D' : '#fff', border: 'none', cursor: 'pointer' }}>
              <Save className="w-3.5 h-3.5" />
              {noteSaved ? 'Saved!' : noteSaving ? 'Saving…' : 'Save Notes'}
            </button>
          )}
        </div>
        <SpeechTextarea
          variant="field"
          fieldKey="ot.notes"
          value={notes}
          onChange={setNotes}
          placeholder="Anything the sections above do not cover"
          disabled={!recordEditable}
          style={{ minHeight: '5rem', ...(!recordEditable ? { opacity: 0.7 } : {}) }}
        />
      </GlassCard>

      {/* Consumables */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>
            Consumables
          </h2>
          <span className="text-xs" style={{ color: '#94A3B8' }}>Billed at pharmacy dispatch</span>
        </div>

        {consumables.length > 0 && (
          <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid #E2E8F0' }}>
            {/* Mobile card rows */}
            <div className="md:hidden divide-y divide-[#F1F5F9]">
              {consumables.map(c => (
                <div key={c.id} className="px-3 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{c.description}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Qty: {c.qty}</p>
                    {c.is_implant && <p className="text-xs mt-0.5" style={{ color: '#7C3AED' }}>{implantText(c)}</p>}
                  </div>
                  {!isClosed && canRecord && (
                    <button onClick={() => handleRemoveConsumable(c.id)}
                      className="p-1.5 rounded-lg flex-shrink-0"
                      style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer' }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(248,250,252,0.9)', borderBottom: '1px solid #E2E8F0' }}>
                  {['Description', 'Qty', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold" style={{ color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {consumables.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: i < consumables.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <td className="px-3 py-2.5" style={{ color: '#0F172A' }}>
                      {c.description}
                      {c.is_implant && <span className="block text-xs mt-0.5" style={{ color: '#7C3AED' }}>{implantText(c)}</span>}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: '#475569' }}>{c.qty}</td>
                    <td className="px-3 py-2.5">
                      {!isClosed && canRecord && (
                        <button onClick={() => handleRemoveConsumable(c.id)}
                          className="p-1 rounded-lg"
                          style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer' }}>
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

        {!isClosed && canRecord && (
          <form onSubmit={handleAddConsumable} className="space-y-2">
            {/* Drug search — full width */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
              <input
                type="text"
                value={drugQuery}
                onChange={e => { setDrugQuery(e.target.value); setNewDesc(e.target.value); setShowDrugDrop(true); setSelectedDrugId(null); setSelectedDrugIsGlobal(false) }}
                onFocus={() => drugQuery.trim() && setShowDrugDrop(true)}
                onBlur={() => setTimeout(() => setShowDrugDrop(false), 150)}
                placeholder="Search pharmacy or type item name…"
                style={{ width: '100%', padding: '0.625rem 0.875rem 0.625rem 2.25rem', borderRadius: '0.75rem', fontSize: '0.875rem', background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }}
              />
              {showDrugDrop && filteredDrugs.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl overflow-hidden shadow-lg"
                  style={{ background: '#fff', border: '1px solid #E2E8F0', maxHeight: '10rem', overflowY: 'auto' }}>
                  {filteredDrugs.map(d => {
                    const brandName = (d.brand_aliases ?? [])[0]
                    const displayName = brandName ?? d.name
                    const genericLabel = brandName ? d.name : null
                    return (
                      <li key={d.id}>
                        <button type="button" onMouseDown={() => selectDrug(d)}
                          className="w-full text-left px-4 py-2.5"
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(13,148,136,0.06)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>{displayName}</span>
                            {d.form && <span className="text-xs px-1.5 py-0.5 rounded-md capitalize" style={{ background: '#F1F5F9', color: '#475569' }}>{d.form}</span>}
                            {d.strength && <span className="text-xs" style={{ color: '#64748B' }}>{d.strength}</span>}
                          </div>
                          {genericLabel && (
                            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{genericLabel}</p>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            {/* Implant — needs a lot number so a recalled implant can be traced to the patient */}
            <label className="flex items-center gap-2 text-xs" style={{ color: '#334155' }}>
              <input type="checkbox" checked={isImplant} onChange={(e) => setIsImplant(e.target.checked)}
                style={{ width: '15px', height: '15px', accentColor: '#7C3AED', cursor: 'pointer' }} />
              This is an implant (plate, screw, mesh, lens, stent…)
            </label>
            {isImplant && (
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
                <Input value={implantLot} onChange={(e) => setImplantLot(e.target.value)} placeholder="Lot / batch no. *" />
                <Input value={implantMaker} onChange={(e) => setImplantMaker(e.target.value)} placeholder="Manufacturer" />
                <Input value={implantSize} onChange={(e) => setImplantSize(e.target.value)} placeholder="Size" />
              </div>
            )}
            {consumableError && <p className="text-xs" style={{ color: '#DC2626' }}>{consumableError}</p>}
            {/* Qty + Add */}
            <div className="flex gap-2 items-center">
              <label className="text-xs font-medium flex-shrink-0" style={{ color: '#64748B' }}>Qty</label>
              <Input type="number" min={1} value={newQty} onChange={e => setNewQty(e.target.value)} style={{ width: '5rem' }} />
              <button type="submit" disabled={addingC || !newDesc.trim()}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-semibold flex-shrink-0"
                style={{ background: newDesc.trim() ? '#0D9488' : '#94A3B8', color: '#fff', border: 'none', cursor: newDesc.trim() ? 'pointer' : 'not-allowed' }}>
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          </form>
        )}
      </GlassCard>

      {/* Post-op ward assignment modal */}
      {showTransfer && schedule.admission_id && (
        <PostOpTransferModal
          admissionId={schedule.admission_id}
          wards={wardOptions}
          onClose={() => setShowTransfer(false)}
          onSuccess={() => { setShowTransfer(false); router.refresh() }}
        />
      )}
    </div>
  )
}

// ---- Post-op ward transfer modal ----
interface WardOpt { id: string; name: string; is_temp: boolean; availableBeds: Pick<Bed, 'id' | 'bed_no'>[] }

function PostOpTransferModal({
  admissionId, wards, onClose, onSuccess,
}: {
  admissionId: string
  wards: WardOpt[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [wardId, setWardId]       = useState('')
  const [bedId, setBedId]         = useState('')
  const [tempSlot, setTempSlot]   = useState('')
  const [wardBeds, setWardBeds]   = useState<Pick<Bed, 'id' | 'bed_no'>[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const selectedWard = wards.find(w => w.id === wardId)
  const isTempWard   = selectedWard?.is_temp ?? false

  useEffect(() => {
    if (!wardId || isTempWard) { setWardBeds([]); setBedId(''); return }
    listAvailableBeds(wardId).then(beds => setWardBeds(beds))
  }, [wardId, isTempWard])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!wardId) { setError('Please select a ward'); return }
    if (!isTempWard && !bedId) { setError('Please select a bed'); return }
    setLoading(true); setError(null)
    const r = await postOpTransferToWard(admissionId, {
      ward_id: wardId,
      bed_id: isTempWard ? null : bedId,
      is_temp_ward: isTempWard,
      temp_slot: isTempWard ? (tempSlot || null) : null,
    })
    setLoading(false)
    if (!r.success) { setError(r.error); return }
    onSuccess()
  }

  return (
    <Modal open={true} onClose={onClose} title="Assign Patient to Ward">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm" style={{ color: '#64748B' }}>
          Surgery is complete. Select the ward and bed where the patient will recover.
        </p>
        <FormField label="Ward" required>
          <Select value={wardId} onChange={e => { setWardId(e.target.value); setBedId(''); setTempSlot('') }}>
            <option value="">Select ward…</option>
            {wards.map(w => (
              <option key={w.id} value={w.id}>
                {w.is_temp ? `⚠ ${w.name} (overflow)` : `${w.name} (${w.availableBeds.length} avail.)`}
              </option>
            ))}
          </Select>
        </FormField>

        {wardId && (
          isTempWard ? (
            <FormField label="Slot label">
              <Input
                value={tempSlot}
                onChange={e => setTempSlot(e.target.value)}
                placeholder="e.g. T-3, Corridor-1 (optional — auto-assigned if blank)"
              />
            </FormField>
          ) : (
            <FormField label="Bed" required>
              <Select value={bedId} onChange={e => setBedId(e.target.value)}>
                <option value="">Select bed…</option>
                {wardBeds.map(b => <option key={b.id} value={b.id}>{b.bed_no}</option>)}
              </Select>
              {wardBeds.length === 0 && (
                <p className="text-xs mt-1" style={{ color: '#EF4444' }}>No available beds in this ward</p>
              )}
            </FormField>
          )
        )}

        {isTempWard && (
          <div className="px-3.5 py-2.5 rounded-xl text-xs"
            style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
            Overflow slot — transfer to a regular ward once a bed is available.
          </div>
        )}

        {error && (
          <div className="text-sm rounded-xl px-3 py-2"
            style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: loading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Assigning…' : 'Assign Ward'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Extracted chip to keep JSX clean
function TeamChip({
  name, role, onRemove,
}: {
  name: string
  role: OtTeamRole
  onRemove?: () => void
}) {
  const colors = ROLE_COLORS[role] ?? ROLE_COLORS.other
  const roleLabel = TEAM_ROLES.find(r => r.value === role)?.label ?? role
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
      <span className="text-xs font-medium" style={{ color: colors.text }}>{name}</span>
      <span className="text-xs px-1.5 py-0.5 rounded-md font-semibold"
        style={{ background: colors.border, color: colors.text }}>
        {roleLabel}
      </span>
      {onRemove && (
        <button onClick={onRemove} type="button"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', color: colors.text, opacity: 0.6, lineHeight: 1 }}>
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

function implantText(c: OtConsumable): string {
  return ['Implant', c.implant_lot_no && `lot ${c.implant_lot_no}`, c.implant_maker, c.implant_size].filter(Boolean).join(' · ')
}
