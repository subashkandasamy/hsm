'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, RefreshCw, CheckCircle, XCircle, Clock, ListOrdered } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  listAppointments, checkIn, cancelAppointment, markNoShow,
} from '@/app/actions/appointments'
import { startVisit } from '@/app/actions/opd'
import type { Appointment } from '@/lib/types'
import BookingModal from './BookingModal'

interface Doctor { id: string; full_name: string; role: string }
interface Department { id: string; name: string }

interface Props {
  initialAppointments: Appointment[]
  doctors: Doctor[]
  departments: Department[]
  initialDate: string
  admittedPatientIds?: string[]
}

const STATUS_COLORS: Record<string, string> = {
  booked: 'pending', checked_in: 'info', done: 'success',
  cancelled: 'cancelled', no_show: 'error',
}

export default function AppointmentsClient({ initialAppointments, doctors, departments, initialDate, admittedPatientIds = [] }: Props) {
  const router = useRouter()
  const [appts, setAppts] = useState<Appointment[]>(initialAppointments)
  const [date, setDate] = useState(initialDate)
  const [doctorFilter, setDoctorFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [showBook, setShowBook] = useState(false)
  const [view, setView] = useState<'schedule' | 'queue'>('schedule')
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const admittedSet = new Set(admittedPatientIds)

  const refresh = useCallback(async (d: string, docId?: string) => {
    setLoading(true)
    const results = await listAppointments({
      date: d,
      ...(docId ? { doctorId: docId } : {}),
    })
    setAppts(results)
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
    await cancelAppointment(id)
    setCancelTarget(null)
    await refresh(date, doctorFilter)
    setActionLoading(null)
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
            onClick={() => setShowBook(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}
          >
            <CalendarPlus className="w-4 h-4" />
            Book Appointment
          </button>
        }
      />

      {/* Error banner */}
      {actionError && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between"
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontWeight: 600, fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Filters — stacked on mobile, row on sm+ */}
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

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm" style={{ color: '#94A3B8' }}>Loading…</div>
        ) : displayed.length === 0 ? (
          <EmptyState
            title={view === 'queue' ? 'No patients in queue' : 'No appointments'}
            description={view === 'queue' ? 'Checked-in patients will appear here.' : 'Book an appointment to get started.'}
          />
        ) : (
          <>
            {/* ── MOBILE CARD VIEW (< md) ── */}
            <div className="md:hidden divide-y" style={{ borderColor: '#F1F5F9' }}>
              {displayed.map((a) => (
                <div key={a.id} className="px-4 py-4">
                  {/* Row 1: token + status */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg"
                      style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
                      #{a.token_no ?? '—'}
                    </span>
                    <StatusBadge status={STATUS_COLORS[a.status] ?? a.status} label={a.status.replace('_', ' ')} />
                  </div>

                  {/* Row 2: patient name + UHID */}
                  <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>
                    {a.patient?.full_name ?? '—'}
                  </p>
                  <p className="font-mono text-xs mb-1" style={{ color: '#94A3B8' }}>{a.patient?.uhid}</p>

                  {/* Row 3: doctor / time / reason */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1.5 text-xs">
                    <div>
                      <span style={{ color: '#94A3B8' }}>Doctor </span>
                      <span className="font-medium" style={{ color: '#475569' }}>{a.doctor?.full_name ?? '—'}</span>
                    </div>
                    <div>
                      <span style={{ color: '#94A3B8' }}>Time </span>
                      <span className="font-medium" style={{ color: '#475569' }}>
                        {new Date(a.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {a.reason && (
                      <div className="col-span-2">
                        <span style={{ color: '#94A3B8' }}>Reason </span>
                        <span className="font-medium truncate" style={{ color: '#475569' }}>{a.reason}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {(a.status === 'booked' || a.status === 'checked_in') && (
                    <div className="flex gap-2 mt-3">
                      {a.status === 'booked' && (
                        <>
                          <button onClick={() => handleCheckIn(a.id)} disabled={actionLoading === a.id}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold flex-1 justify-center"
                            style={{ background: '#DBEAFE', color: '#1D4ED8', border: 'none', cursor: 'pointer' }}>
                            <CheckCircle className="w-3.5 h-3.5" /> Check In
                          </button>
                          <button onClick={() => handleNoShow(a.id)} disabled={actionLoading === a.id}
                            className="p-2 rounded-xl" title="No Show"
                            style={{ background: '#FEF3C7', color: '#B45309', border: 'none', cursor: 'pointer' }}>
                            <Clock className="w-4 h-4" />
                          </button>
                          <button onClick={() => setCancelTarget(a.id)} disabled={actionLoading === a.id}
                            className="p-2 rounded-xl" title="Cancel"
                            style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer' }}>
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {a.status === 'checked_in' && (
                        <>
                          {admittedSet.has(a.patient_id as string) ? (
                            <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold flex-1 justify-center"
                              style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                              In IPD
                            </span>
                          ) : (
                            <>
                              <button onClick={() => handleStartVisit(a.id)} disabled={actionLoading === a.id}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold flex-1 justify-center"
                                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                Start OPD
                              </button>
                              <button onClick={() => setCancelTarget(a.id)} disabled={actionLoading === a.id}
                                className="p-2 rounded-xl" title="Cancel"
                                style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer' }}>
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── DESKTOP TABLE (md+) ── */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(248,250,252,0.8)', borderBottom: '1px solid #E2E8F0' }}>
                  {['#', 'Patient', 'Doctor', 'Time', 'Reason', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-semibold" style={{ color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((a, i) => (
                  <tr key={a.id} style={{ borderBottom: i < displayed.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold" style={{ color: '#0D9488' }}>{a.token_no ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: '#0F172A' }}>{a.patient?.full_name ?? '—'}</p>
                      <p className="text-xs font-mono" style={{ color: '#94A3B8' }}>{a.patient?.uhid}</p>
                    </td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>
                      {a.doctor?.full_name ?? '—'}
                      {a.department && <p className="text-xs" style={{ color: '#94A3B8' }}>{a.department.name}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#64748B' }}>
                      {new Date(a.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-xs max-w-32 truncate" style={{ color: '#475569' }}>{a.reason ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={STATUS_COLORS[a.status] ?? a.status} label={a.status.replace('_', ' ')} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {a.status === 'booked' && (
                          <>
                            <button onClick={() => handleCheckIn(a.id)} disabled={actionLoading === a.id}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                              style={{ background: '#DBEAFE', color: '#1D4ED8', cursor: 'pointer', border: 'none' }}>
                              <CheckCircle className="w-3.5 h-3.5" /> Check In
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
                          <>
                            {admittedSet.has(a.patient_id as string) ? (
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
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </GlassCard>

      <BookingModal
        open={showBook}
        onClose={() => setShowBook(false)}
        doctors={doctors}
        departments={departments}
        onSuccess={(appt) => {
          setAppts((prev) => {
            const apptDate = appt.scheduled_at.split('T')[0]
            if (apptDate === date) return [appt, ...prev]
            return prev
          })
          setShowBook(false)
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
