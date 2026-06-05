'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Stethoscope, User, Clock } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import { getTodaysQueue } from '@/app/actions/appointments'
import { startVisit } from '@/app/actions/opd'
import type { Appointment } from '@/lib/types'

interface Props {
  initialQueue: Appointment[]
  doctorId: string | undefined
}

export default function OpdWorklist({ initialQueue, doctorId }: Props) {
  const router = useRouter()
  const [queue, setQueue] = useState<Appointment[]>(initialQueue)
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    const q = await getTodaysQueue(doctorId)
    setQueue(q)
    setLoading(false)
  }

  async function handleStart(appointmentId: string) {
    setActionId(appointmentId)
    const result = await startVisit(appointmentId)
    setActionId(null)
    if (result.success) router.push(`/opd/${result.visitId}`)
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
          {queue.map((a, i) => (
            <GlassCard key={a.id} className="p-4">
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
                    <p className="font-semibold truncate" style={{ color: '#0F172A' }}>
                      {a.patient?.full_name ?? 'Unknown'}
                    </p>
                    <p className="text-xs" style={{ color: '#64748B' }}>
                      <span className="font-mono">{a.patient?.uhid}</span>
                      {a.patient?.phone && <> · {a.patient.phone}</>}
                    </p>
                    {a.reason && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: '#94A3B8' }}>
                        {a.reason}
                      </p>
                    )}
                  </div>
                </div>

                {/* Doctor + time */}
                <div className="text-right hidden sm:block">
                  <p className="text-sm" style={{ color: '#475569' }}>{a.doctor?.full_name}</p>
                  <p className="text-xs flex items-center justify-end gap-1 mt-0.5" style={{ color: '#94A3B8' }}>
                    <Clock className="w-3 h-3" />
                    {new Date(a.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                {/* Action */}
                <button
                  onClick={() => handleStart(a.id)}
                  disabled={actionId === a.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold flex-shrink-0"
                  style={{
                    background: actionId === a.id ? '#94A3B8' : '#0D9488',
                    color: '#fff', border: 'none',
                    cursor: actionId === a.id ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Stethoscope className="w-4 h-4" />
                  {actionId === a.id ? 'Starting…' : 'Start Consultation'}
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  )
}
