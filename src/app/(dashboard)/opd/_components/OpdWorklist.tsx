'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Stethoscope, Clock, CreditCard, ShieldCheck } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import { getTodaysQueue, getAppointmentsBillStatuses } from '@/app/actions/appointments'
import { startVisit } from '@/app/actions/opd'
import type { Appointment } from '@/lib/types'
import { useIsReadOnly } from '@/context/ReadOnlyContext'

type BillStatus = { id: string; status: string; total: number; paid: number; cashlessCovered: boolean; payFirst: boolean }

interface Props {
  initialQueue: Appointment[]
  doctorId: string | undefined
  initialBillStatuses: Record<string, BillStatus>
}

export default function OpdWorklist({ initialQueue, doctorId, initialBillStatuses }: Props) {
  const router = useRouter()
  const [queue, setQueue]               = useState<Appointment[]>(initialQueue)
  const [billStatuses, setBillStatuses] = useState(initialBillStatuses)
  const [loading, setLoading]           = useState(false)
  const [actionId, setActionId]         = useState<string | null>(null)
  const isReadOnly = useIsReadOnly()

  async function refresh() {
    setLoading(true)
    const q = await getTodaysQueue(doctorId)
    const bs = await getAppointmentsBillStatuses(q.map((a) => a.id))
    setQueue(q)
    setBillStatuses(bs)
    setLoading(false)
  }

  async function handleStart(appt: Appointment) {
    setActionId(appt.id)
    const result = await startVisit(appt.id)
    setActionId(null)
    if (result.success) {
      router.push(`/opd/${result.visitId}`)
    } else {
      const bs = await getAppointmentsBillStatuses(queue.map((a) => a.id))
      setBillStatuses(bs)
    }
  }

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
  })

  return (
    <div>
      <PageHeader
        title="OPD Worklist"
        subtitle={`Today · ${today} · ${queue.length} patient${queue.length !== 1 ? 's' : ''} checked in`}
        action={
          <button onClick={refresh}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {queue.length === 0 ? (
        <GlassCard className="p-6">
          <EmptyState
            title="No patients in queue"
            description="Checked-in patients from Appointments will appear here."
            icon={<Stethoscope className="w-6 h-6" style={{ color: '#94A3B8' }} />}
          />
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {queue.map((a, i) => {
            const bill = billStatuses[a.id]
            const isCashless = !!bill && bill.status !== 'paid' && bill.cashlessCovered
            const isPaid = !bill || bill.status === 'paid'
            // isUnpaid = the consultation must wait for payment. When this hospital
            // takes payment after the visit, the fee is still owed (isDueLater) but
            // nothing waits on it — the same rule startVisit enforces.
            const owed = !!bill && bill.status !== 'paid' && !bill.cashlessCovered
            const isUnpaid = owed && bill.payFirst !== false
            const isDueLater = owed && bill.payFirst === false
            const busy = actionId === a.id
            const time = new Date(a.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

            return (
              <div key={a.id} className="rounded-2xl overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.92)',
                  border: `1px solid ${isUnpaid ? 'rgba(239,68,68,0.25)' : '#E2E8F0'}`,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}>
                <div className="flex items-stretch">
                  {/* Left accent strip — red if unpaid, teal if clear */}
                  <div className="w-1 flex-shrink-0 rounded-l-2xl"
                    style={{ background: isUnpaid ? '#EF4444' : '#0D9488' }} />

                  <div className="flex-1 min-w-0 p-4">
                    {/* Top section: token + info + desktop button */}
                    <div className="flex items-start gap-3">
                      {/* Token badge */}
                      <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
                        style={{ background: isUnpaid ? 'rgba(239,68,68,0.08)' : 'rgba(13,148,136,0.1)', border: `1px solid ${isUnpaid ? 'rgba(239,68,68,0.2)' : 'rgba(13,148,136,0.2)'}` }}>
                        <span className="font-black text-lg leading-none" style={{ color: isUnpaid ? '#DC2626' : '#0D9488' }}>
                          {a.token_no ?? i + 1}
                        </span>
                        <span className="text-xs font-semibold leading-none mt-0.5" style={{ color: isUnpaid ? '#DC2626' : '#0D9488', opacity: 0.7 }}>token</span>
                      </div>

                      {/* Patient info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>
                            {a.patient?.full_name ?? 'Unknown'}
                          </p>
                          {isUnpaid && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold flex-shrink-0"
                              style={{ background: 'rgba(239,68,68,0.1)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)' }}>
                              <CreditCard className="w-3 h-3" />
                              ₹{bill.total.toFixed(0)} due
                            </span>
                          )}
                          {isDueLater && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold flex-shrink-0"
                              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                              <CreditCard className="w-3 h-3" />
                              ₹{bill.total.toFixed(0)} due after visit
                            </span>
                          )}
                          {isPaid && bill && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold flex-shrink-0"
                              style={{ background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' }}>
                              Paid
                            </span>
                          )}
                          {isCashless && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold flex-shrink-0"
                              style={{ background: 'rgba(99,102,241,0.1)', color: '#4F46E5', border: '1px solid rgba(99,102,241,0.2)' }}>
                              <ShieldCheck className="w-3 h-3" />
                              Cashless — approved
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                          {a.patient?.uhid}{a.patient?.phone ? ` · ${a.patient.phone}` : ''}
                        </p>
                        {/* Doctor + time — visible on both mobile and desktop */}
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {a.doctor?.full_name && (
                            <span className="text-xs" style={{ color: '#475569' }}>{a.doctor.full_name}</span>
                          )}
                          <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#94A3B8' }}>
                            <Clock className="w-3 h-3" />{time}
                          </span>
                          {a.reason && (
                            <span className="text-xs truncate max-w-40" style={{ color: '#94A3B8' }}>{a.reason}</span>
                          )}
                        </div>
                        {isUnpaid && (
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <button
                              onClick={() => router.push('/billing')}
                              className="flex items-center gap-1 text-xs font-medium"
                              style={{ background: 'none', border: 'none', color: '#0D9488', cursor: 'pointer', padding: 0 }}>
                              <CreditCard className="w-3 h-3" />
                              Collect payment before starting →
                            </button>
                            <button
                              onClick={() => router.push(`/insurance/${a.patient_id}`)}
                              className="flex items-center gap-1 text-xs font-medium"
                              style={{ background: 'none', border: 'none', color: '#4F46E5', cursor: 'pointer', padding: 0 }}>
                              <ShieldCheck className="w-3 h-3" />
                              Verify cashless on Insurance page →
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Action button — desktop only (inline) */}
                      <button
                        onClick={() => handleStart(a)}
                        disabled={busy || isReadOnly}
                        title={isReadOnly ? 'Renew subscription to start consultations' : undefined}
                        className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold flex-shrink-0"
                        style={{
                          background: (busy || isReadOnly) ? '#94A3B8' : isUnpaid ? '#EF4444' : '#0D9488',
                          color: '#fff', border: 'none',
                          cursor: (busy || isReadOnly) ? 'not-allowed' : 'pointer',
                          opacity: isReadOnly ? 0.6 : 1,
                        }}>
                        {isUnpaid ? <CreditCard className="w-4 h-4" /> : <Stethoscope className="w-4 h-4" />}
                        {busy ? 'Starting…' : isUnpaid ? 'Payment Pending' : 'Start Consultation'}
                      </button>
                    </div>

                    {/* Action button — mobile full-width */}
                    <button
                      onClick={() => handleStart(a)}
                      disabled={busy || isReadOnly}
                      title={isReadOnly ? 'Renew subscription to start consultations' : undefined}
                      className="mt-3 sm:hidden w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
                      style={{
                        background: (busy || isReadOnly) ? '#94A3B8' : isUnpaid ? '#EF4444' : '#0D9488',
                        color: '#fff', border: 'none',
                        cursor: (busy || isReadOnly) ? 'not-allowed' : 'pointer',
                        opacity: isReadOnly ? 0.6 : 1,
                      }}>
                      {isUnpaid ? <CreditCard className="w-4 h-4" /> : <Stethoscope className="w-4 h-4" />}
                      {busy ? 'Starting…' : isUnpaid ? 'Payment Pending' : 'Start Consultation'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
