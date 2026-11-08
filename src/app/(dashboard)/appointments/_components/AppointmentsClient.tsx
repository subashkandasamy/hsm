'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, RefreshCw, CheckCircle, XCircle, Clock, ListOrdered, CalendarClock } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  listAppointments, checkIn, cancelAppointment, markNoShow, getAppointmentsBillStatuses,
} from '@/app/actions/appointments'
import { startVisit } from '@/app/actions/opd'
import { Pencil } from 'lucide-react'
import type { Appointment } from '@/lib/types'
import BookingModal from './BookingModal'
import FollowUpsPanel from './FollowUpsPanel'
import { useIsReadOnly } from '@/context/ReadOnlyContext'

interface Doctor { id: string; full_name: string; role: string }
interface Department { id: string; name: string }
type BillStatusMap = Record<string, { id: string; status: string; total: number; paid: number; cashlessCovered?: boolean; payFirst?: boolean }>

interface Props {
  initialAppointments: Appointment[]
  doctors: Doctor[]
  departments: Department[]
  initialDate: string
  admittedPatientIds?: string[]
  initialBillStatuses?: BillStatusMap
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  booked:     { bg: '#EFF6FF', color: '#1D4ED8' },
  checked_in: { bg: '#DCFCE7', color: '#15803D' },
  done:       { bg: '#F0FDF4', color: '#15803D' },
  cancelled:  { bg: '#FEE2E2', color: '#B91C1C' },
  no_show:    { bg: '#FEF3C7', color: '#B45309' },
}

const STATUS_COLORS: Record<string, string> = {
  booked: 'pending', checked_in: 'info', done: 'success',
  cancelled: 'cancelled', no_show: 'error',
}

export default function AppointmentsClient({ initialAppointments, doctors, departments, initialDate, admittedPatientIds = [], initialBillStatuses = {} }: Props) {
  const router = useRouter()
  const [appts, setAppts] = useState<Appointment[]>(initialAppointments)
  const [date, setDate] = useState(initialDate)
  const [doctorFilter, setDoctorFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [showBook, setShowBook] = useState(false)
  const [view, setView] = useState<'schedule' | 'queue'>('schedule')
  const [tab, setTab] = useState<'appointments' | 'followups'>('appointments')
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Appointment | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [billStatuses, setBillStatuses] = useState<BillStatusMap>(initialBillStatuses)
  const isReadOnly = useIsReadOnly()
  const admittedSet = new Set(admittedPatientIds)

  const refresh = useCallback(async (d: string, docId?: string) => {
    setLoading(true)
    const results = await listAppointments({
      date: d,
      ...(docId ? { doctorId: docId } : {}),
    })
    setAppts(results)
    const statuses = await getAppointmentsBillStatuses(results.map((a) => a.id))
    setBillStatuses(statuses)
    setLoading(false)
  }, [])

  async function handleCheckIn(id: string) {
    setActionLoading(id)
    await checkIn(id)
    await refresh(date, doctorFilter)
    setActionLoading(null)
  }

  async function handleCancel(id: string) {
    setActionLoading(id)
    const result = await cancelAppointment(id)
    setCancelTarget(null)
    setActionLoading(null)
    if (!result.success) { setActionError(result.error); return }
    await refresh(date, doctorFilter)
  }

  async function handleNoShow(id: string) {
    setActionLoading(id)
    await markNoShow(id)
    await refresh(date, doctorFilter)
    setActionLoading(null)
  }

  async function handleStartVisit(appointmentId: string) {
    setActionLoading(appointmentId)
    setActionError(null)
    const result = await startVisit(appointmentId)
    setActionLoading(null)
    if (result.success) {
      router.push(`/opd/${result.visitId}`)
    } else {
      setActionError(result.error)
    }
  }

  const displayed = view === 'queue'
    ? appts.filter((a) => a.status === 'checked_in').sort((a, b) => (a.token_no ?? 0) - (b.token_no ?? 0))
    : appts

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="Schedule and manage patient appointments"
        action={
          <button
            onClick={() => !isReadOnly && setShowBook(true)}
            disabled={isReadOnly}
            title={isReadOnly ? 'Renew subscription to book appointments' : undefined}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1 }}
            onMouseEnter={(e) => { if (!isReadOnly) e.currentTarget.style.background = '#0F766E' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}
          >
            <CalendarPlus className="w-4 h-4" />
            Book Appointment
          </button>
        }
      />

      {/* Main tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-4 w-fit" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
        {[
          { key: 'appointments' as const, label: 'Appointments' },
          { key: 'followups' as const, label: 'Follow-ups' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
            style={tab === key ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' } : { background: 'none', color: '#64748B', border: 'none', cursor: 'pointer' }}>
            {key === 'followups' && <CalendarClock className="w-4 h-4" />}{label}
          </button>
        ))}
      </div>

      {tab === 'followups' ? (
        <FollowUpsPanel doctors={doctors} />
      ) : (
      <>
      {/* Error banner */}
      {actionError && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between"
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontWeight: 600, fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap mb-5">
        <div className="flex gap-2 flex-1">
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); refresh(e.target.value, doctorFilter) }}
            className="flex-1 px-3 py-2.5 rounded-xl text-sm"
            style={{ minHeight: '44px', background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
          />
          <button
            onClick={() => refresh(date, doctorFilter)}
            className="p-2.5 rounded-xl flex-shrink-0"
            style={{ minHeight: '44px', minWidth: '44px', background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <Select
          value={doctorFilter}
          onChange={(e) => { setDoctorFilter(e.target.value); refresh(date, e.target.value) }}
          className="w-full sm:w-48"
        >
          <option value="">All Doctors</option>
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
        </Select>

        {/* View toggle */}
        <div className="flex gap-1 p-1 rounded-xl sm:ml-auto"
          style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
          {[
            { key: 'schedule' as const, icon: <Clock className="w-4 h-4" />, label: 'Schedule' },
            { key: 'queue' as const, icon: <ListOrdered className="w-4 h-4" />, label: `Queue (${appts.filter(a => a.status === 'checked_in').length})` },
          ].map(({ key, icon, label }) => (
            <button key={key} onClick={() => setView(key)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
              style={view === key ? { background: '#0D9488', color: '#fff' } : { color: '#64748B' }}>
              {icon}{label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm" style={{ color: '#94A3B8' }}>Loading…</div>
      ) : displayed.length === 0 ? (
        <GlassCard>
          <EmptyState
            title={view === 'queue' ? 'No patients in queue' : 'No appointments'}
            description={view === 'queue' ? 'Checked-in patients will appear here.' : 'Book an appointment to get started.'}
          />
        </GlassCard>
      ) : (
        <>
          {/* ── MOBILE CARDS (< md) ── */}
          <div className="md:hidden space-y-2">
            {displayed.map((a) => {
              const b = billStatuses[a.id]
              const isPaid = !b || b.status === 'paid'
              // Red only when the consultation must wait for this payment — not when
              // it is cashless, or this hospital takes the fee after the visit.
              const isUnpaid = b && b.status !== 'paid' && !b.cashlessCovered && b.payFirst !== false
              const busy = actionLoading === a.id
              const statusStyle = STATUS_STYLES[a.status] ?? { bg: '#F1F5F9', color: '#64748B' }
              const time = new Date(a.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

              return (
                <div key={a.id} className="rounded-2xl overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.92)',
                    border: `1px solid ${isUnpaid ? 'rgba(239,68,68,0.25)' : '#E2E8F0'}`,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
                  }}>
                  <div className="flex items-stretch">
                    {/* Left status strip */}
                    <div className="w-1 flex-shrink-0 rounded-l-2xl"
                      style={{ background: a.status === 'checked_in' ? '#0D9488' : a.status === 'done' ? '#10B981' : a.status === 'cancelled' ? '#EF4444' : a.status === 'no_show' ? '#F59E0B' : '#3B82F6' }} />
                    <div className="flex-1 min-w-0 p-3.5">
                      {/* Top row: token + time + status */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg"
                          style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
                          #{a.token_no ?? '—'}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg"
                          style={{ background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
                          <Clock className="w-3 h-3" />
                          {time}
                        </span>
                        <span className="ml-auto flex-shrink-0">
                          <span className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                            style={statusStyle}>{a.status.replace('_', ' ')}</span>
                        </span>
                      </div>

                      {/* Patient name + UHID */}
                      <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{a.patient?.full_name ?? '—'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="font-mono text-xs" style={{ color: '#94A3B8' }}>{a.patient?.uhid}</p>
                        {b && (
                          <span className="text-xs px-1.5 py-0.5 rounded-md font-semibold"
                            style={isPaid
                              ? { background: '#DCFCE7', color: '#15803D' }
                              : { background: '#FEF3C7', color: '#B45309' }}>
                            {isPaid ? `₹${b.total} paid` : `₹${b.total} due`}
                          </span>
                        )}
                      </div>

                      {/* Doctor + reason */}
                      <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap" style={{ color: '#64748B' }}>
                        {a.doctor?.full_name && <span>{a.doctor.full_name}</span>}
                        {a.reason && <span style={{ color: '#94A3B8' }}>{a.reason}</span>}
                      </div>

                      {/* Actions */}
                      {(a.status === 'booked' || a.status === 'checked_in') && (
                        <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                          {a.status === 'booked' && (
                            <>
                              <button onClick={() => handleCheckIn(a.id)} disabled={busy || isReadOnly}
                                title={isReadOnly ? 'Renew subscription to check in patients' : undefined}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold flex-1 justify-center"
                                style={{ background: '#DBEAFE', color: '#1D4ED8', border: 'none', cursor: (busy || isReadOnly) ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1 }}>
                                <CheckCircle className="w-3.5 h-3.5" /> Check In
                              </button>
                              <button onClick={() => !isReadOnly && setEditTarget(a)} disabled={busy || isReadOnly}
                                className="p-2 rounded-xl" title={isReadOnly ? 'Renew to edit' : 'Edit'}
                                style={{ background: '#F0FDF4', color: '#15803D', border: 'none', cursor: (busy || isReadOnly) ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1 }}>
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleNoShow(a.id)} disabled={busy || isReadOnly}
                                className="p-2 rounded-xl" title={isReadOnly ? 'Renew to mark no-show' : 'No Show'}
                                style={{ background: '#FEF3C7', color: '#B45309', border: 'none', cursor: (busy || isReadOnly) ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1 }}>
                                <Clock className="w-4 h-4" />
                              </button>
                              <button onClick={() => setCancelTarget(a.id)} disabled={busy || isReadOnly}
                                className="p-2 rounded-xl" title={isReadOnly ? 'Renew to cancel' : 'Cancel'}
                                style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: (busy || isReadOnly) ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1 }}>
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {a.status === 'checked_in' && (
                            admittedSet.has(a.patient_id as string) ? (
                              <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold flex-1 justify-center"
                                style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                                In IPD
                              </span>
                            ) : (
                              <>
                                <button onClick={() => handleStartVisit(a.id)} disabled={busy || isReadOnly}
                                  title={isReadOnly ? 'Renew subscription to start consultations' : undefined}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold flex-1 justify-center"
                                  style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: (busy || isReadOnly) ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1 }}>
                                  Start OPD
                                </button>
                                <button onClick={() => setCancelTarget(a.id)} disabled={busy || isReadOnly}
                                  className="p-2 rounded-xl" title={isReadOnly ? 'Renew to cancel' : 'Cancel'}
                                  style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: (busy || isReadOnly) ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1 }}>
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── DESKTOP TABLE (md+) ── */}
          <GlassCard className="hidden md:block overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(248,250,252,0.8)', borderBottom: '2px solid #E2E8F0' }}>
                  {['#', 'Patient', 'Doctor', 'Time', 'Reason', 'Status', 'Bill', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3.5 font-semibold text-xs uppercase tracking-wide" style={{ color: '#64748B' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((a, i) => (
                  <tr key={a.id} style={{ borderBottom: i < displayed.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs font-bold" style={{ color: '#0D9488' }}>{a.token_no ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold" style={{ color: '#0F172A' }}>{a.patient?.full_name ?? '—'}</p>
                      <p className="text-xs font-mono mt-0.5" style={{ color: '#94A3B8' }}>{a.patient?.uhid}</p>
                    </td>
                    <td className="px-4 py-3.5" style={{ color: '#475569' }}>
                      {a.doctor?.full_name ?? '—'}
                      {a.department && <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{a.department.name}</p>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1 text-xs font-medium"
                        style={{ color: '#64748B' }}>
                        <Clock className="w-3 h-3" />
                        {new Date(a.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs max-w-32 truncate" style={{ color: '#475569' }}>{a.reason ?? '—'}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={STATUS_COLORS[a.status] ?? a.status} label={a.status.replace('_', ' ')} />
                    </td>
                    <td className="px-4 py-3.5">
                      {(() => {
                        const b = billStatuses[a.id]
                        if (!b) return <span className="text-xs" style={{ color: '#CBD5E1' }}>—</span>
                        const isPaid = b.status === 'paid'
                        return (
                          <span className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                            style={isPaid
                              ? { background: '#DCFCE7', color: '#15803D' }
                              : { background: '#FEF3C7', color: '#B45309' }}>
                            {isPaid ? `₹${b.total} Paid` : `₹${b.total} due`}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {a.status === 'booked' && (
                          <>
                            <button onClick={() => handleCheckIn(a.id)} disabled={actionLoading === a.id}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                              style={{ background: '#DBEAFE', color: '#1D4ED8', cursor: 'pointer', border: 'none' }}>
                              <CheckCircle className="w-3.5 h-3.5" /> Check In
                            </button>
                            <button onClick={() => setEditTarget(a)} disabled={actionLoading === a.id}
                              className="p-1.5 rounded-lg" title="Edit"
                              style={{ background: '#F0FDF4', color: '#15803D', cursor: 'pointer', border: 'none' }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleNoShow(a.id)} disabled={actionLoading === a.id}
                              className="p-1.5 rounded-lg" title="No Show"
                              style={{ background: '#FEF3C7', color: '#B45309', cursor: 'pointer', border: 'none' }}>
                              <Clock className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setCancelTarget(a.id)} disabled={actionLoading === a.id}
                              className="p-1.5 rounded-lg" title="Cancel"
                              style={{ background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', border: 'none' }}>
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {a.status === 'checked_in' && (
                          admittedSet.has(a.patient_id as string) ? (
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
                              style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                              In IPD
                            </span>
                          ) : (
                            <>
                              <button onClick={() => handleStartVisit(a.id)} disabled={actionLoading === a.id}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
                                style={{ background: '#0D9488', color: '#fff', cursor: 'pointer', border: 'none' }}>
                                Start OPD
                              </button>
                              <button onClick={() => setCancelTarget(a.id)} disabled={actionLoading === a.id}
                                className="p-1.5 rounded-lg" title="Cancel"
                                style={{ background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', border: 'none' }}>
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        </>
      )}
      </>
      )}

      <BookingModal
        open={showBook || !!editTarget}
        onClose={() => { setShowBook(false); setEditTarget(null) }}
        doctors={doctors}
        departments={departments}
        editingAppointment={editTarget}
        onSuccess={(appt) => {
          if (editTarget) {
            setAppts((prev) => prev.map((a) => a.id === appt.id ? appt : a))
            setEditTarget(null)
            getAppointmentsBillStatuses([appt.id]).then((s) =>
              setBillStatuses((prev) => ({ ...prev, ...s }))
            )
          } else {
            setAppts((prev) => {
              const apptDate = appt.scheduled_at.split('T')[0]
              if (apptDate === date) return [appt, ...prev]
              return prev
            })
            setShowBook(false)
            getAppointmentsBillStatuses([appt.id]).then((s) =>
              setBillStatuses((prev) => ({ ...prev, ...s }))
            )
          }
        }}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && handleCancel(cancelTarget)}
        title="Cancel Appointment"
        description="This will cancel the appointment. The patient slot will be freed. This cannot be undone."
        confirmLabel="Cancel Appointment"
        loading={actionLoading === cancelTarget}
      />
    </div>
  )
}
