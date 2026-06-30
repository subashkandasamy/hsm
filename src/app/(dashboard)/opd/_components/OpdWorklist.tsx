'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Stethoscope, User, Clock, CreditCard } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import { getTodaysQueue, getAppointmentsBillStatuses } from '@/app/actions/appointments'
import { startVisit } from '@/app/actions/opd'
import type { Appointment } from '@/lib/types'

type BillStatus = { id: string; status: string; total: number; paid: number }

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
      // Re-fetch bill statuses in case status changed (e.g., paid elsewhere)
      const bs = await getAppointmentsBillStatuses(queue.map((a) => a.id))
      setBillStatuses(bs)
    }
  }

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
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
            const isPaid = !bill || bill.status === 'paid'
            const isUnpaid = bill && bill.status !== 'paid'
            const busy = actionId === a.id

            return (
              <GlassCard key={a.id} className="p-4"
                style={isUnpaid ? { borderLeft: '3px solid #EF4444' } : undefined}>
                <div className="flex items-center gap-4">
                  {/* Token */}
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 font-bold text-lg"
                    style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}>
                    {a.token_no ?? i + 1}
                  </div>

                  {/* Patient info */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: '#F1F5F9' }}>
                      <User className="w-4 h-4" style={{ color: '#94A3B8' }} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold truncate" style={{ color: '#0F172A' }}>
                          {a.patient?.full_name ?? 'Unknown'}
                        </p>
                        {/* Payment status chip — shown proactively */}
                        {isUnpaid && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold flex-shrink-0"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <CreditCard className="w-3 h-3" />
                            Unpaid ₹{bill.total.toFixed(0)}
                          </span>
                        )}
                        {isPaid && bill && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold flex-shrink-0"
                            style={{ background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' }}>
                            Paid
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                        <span className="font-mono">{a.patient?.uhid}</span>
                        {a.patient?.phone && <> · {a.patient.phone}</>}
                      </p>
                      {a.reason && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: '#94A3B8' }}>
                          {a.reason}
                        </p>
                      )}
                      {/* Payment hint */}
                      {isUnpaid && (
                        <button
                          onClick={() => router.push('/billing')}
                          className="flex items-center gap-1 mt-1.5 text-xs font-medium"
                          style={{ background: 'none', border: 'none', color: '#0D9488', cursor: 'pointer', padding: 0 }}>
                          <CreditCard className="w-3 h-3" />
                          Collect payment before starting →
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Doctor + time */}
                  <div className="text-right hidden sm:block flex-shrink-0">
                    <p className="text-sm" style={{ color: '#475569' }}>{a.doctor?.full_name}</p>
                    <p className="text-xs flex items-center justify-end gap-1 mt-0.5" style={{ color: '#94A3B8' }}>
                      <Clock className="w-3 h-3" />
                      {new Date(a.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Action button */}
                  <button
                    onClick={() => handleStart(a)}
                    disabled={busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold flex-shrink-0"
                    style={{
                      background: busy ? '#94A3B8' : isUnpaid ? '#EF4444' : '#0D9488',
                      color: '#fff',
                      border: 'none',
                      cursor: busy ? 'not-allowed' : 'pointer',
                    }}>
                    {isUnpaid
                      ? <CreditCard className="w-4 h-4" />
                      : <Stethoscope className="w-4 h-4" />}
                    {busy ? 'Starting…' : isUnpaid ? 'Payment Pending' : 'Start Consultation'}
                  </button>
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
