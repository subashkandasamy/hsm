'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Settings, Scissors } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import { listSchedules } from '@/app/actions/ot'
import type { OtRoom, OtSchedule, Profile } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import ScheduleModal from './ScheduleModal'
import ScheduleDetailModal from './ScheduleDetailModal'
import RoomModal from './RoomModal'

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  scheduled:   { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
  in_progress: { bg: '#FEF3C7', border: '#FDE68A', text: '#B45309' },
  completed:   { bg: '#DCFCE7', border: '#BBF7D0', text: '#15803D' },
  cancelled:   { bg: '#F1F5F9', border: '#E2E8F0', text: '#94A3B8' },
}

interface Props {
  initialSchedules: OtSchedule[]
  rooms: OtRoom[]
  initialDate: string
  doctors: Pick<Profile, 'id' | 'full_name' | 'role'>[]
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export default function OtClient({ initialSchedules, rooms: initRooms, doctors, initialDate }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canSchedule = !!role && hasPermission(role, 'ot:schedule')
  const canManage   = !!role && hasPermission(role, 'ot:manage')

  const [date, setDate] = useState(initialDate)
  const [schedules, setSchedules] = useState<OtSchedule[]>(initialSchedules)
  const [rooms, setRooms] = useState<OtRoom[]>(initRooms)
  const [loading, setLoading] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [showRoom, setShowRoom] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  async function loadDay(d: string) {
    setLoading(true)
    const s = await listSchedules({ date: d })
    setSchedules(s)
    setLoading(false)
  }

  function navigate(n: number) {
    const next = addDays(date, n)
    setDate(next)
    loadDay(next)
  }

  const isToday = date === new Date().toISOString().split('T')[0]

  return (
    <div>
      <PageHeader
        title="Operation Theatre"
        subtitle="Surgical scheduling and theatre management"
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => loadDay(date)} className="p-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canManage && (
              <button onClick={() => setShowRoom(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.8)', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                <Settings className="w-4 h-4" /> Rooms ({rooms.length})
              </button>
            )}
            {canSchedule && (
              <button onClick={() => setShowSchedule(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}>
                <Plus className="w-4 h-4" /> Schedule Surgery
              </button>
            )}
          </div>
        }
      />

      {/* Date navigator */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
          <ChevronLeft className="w-4 h-4" style={{ color: '#64748B' }} />
        </button>
        <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>{fmtDate(date)}</span>
        <button onClick={() => navigate(1)} className="p-1.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
          <ChevronRight className="w-4 h-4" style={{ color: '#64748B' }} />
        </button>
        {!isToday && (
          <button onClick={() => { const t = new Date().toISOString().split('T')[0]; setDate(t); loadDay(t) }}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)', cursor: 'pointer' }}>
            Today
          </button>
        )}
      </div>

      {rooms.length === 0 ? (
        <GlassCard className="p-6">
          <EmptyState title="No OT rooms configured"
            description={canManage ? 'Use the Rooms button to add theatres first.' : 'Ask an admin to configure OT rooms.'}
            icon={<Scissors className="w-6 h-6" style={{ color: '#94A3B8' }} />} />
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {rooms.map((room) => {
            const roomSchedules = schedules
              .filter((s) => s.ot_room_id === room.id && s.status !== 'cancelled')
              .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))
            return (
              <GlassCard key={room.id} className="overflow-hidden">
                <div className="px-5 py-3 flex items-center justify-between"
                  style={{ background: 'rgba(248,250,252,0.9)', borderBottom: '1px solid #E2E8F0' }}>
                  <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: '#0F172A' }}>
                    <Scissors className="w-4 h-4" style={{ color: '#0D9488' }} />
                    {room.name}
                  </h3>
                  <span className="text-xs" style={{ color: '#94A3B8' }}>
                    {roomSchedules.length} procedure{roomSchedules.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {roomSchedules.length === 0 ? (
                  <div className="px-5 py-6 text-center">
                    <p className="text-sm" style={{ color: '#94A3B8' }}>No procedures scheduled</p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
                    {roomSchedules.map((s) => {
                      const sc = STATUS_COLORS[s.status] ?? STATUS_COLORS.scheduled
                      return (
                        <button key={s.id} onClick={() => setDetailId(s.id)}
                          className="w-full text-left px-5 py-3.5 flex items-start gap-4"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.04)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                          {/* Time block */}
                          <div className="flex-shrink-0 text-right w-24">
                            <p className="text-xs font-semibold" style={{ color: '#0F172A' }}>{fmtTime(s.scheduled_start)}</p>
                            <p className="text-xs" style={{ color: '#94A3B8' }}>{fmtTime(s.scheduled_end)}</p>
                          </div>
                          {/* Color bar */}
                          <div className="w-1 self-stretch rounded-full flex-shrink-0"
                            style={{ background: sc.border }} />
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{s.procedure_name}</p>
                              <span className="text-xs px-2 py-0.5 rounded-lg font-medium"
                                style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                                {s.status.replace('_', ' ')}
                              </span>
                            </div>
                            <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
                              {s.patient?.full_name} · <span className="font-mono">{s.patient?.uhid}</span>
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                              Surgeon: {s.surgeon?.full_name}
                              {s.anaesthetist && ` · Anaest: ${s.anaesthetist.full_name}`}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </GlassCard>
            )
          })}

          {/* Cancelled schedules summary */}
          {schedules.filter((s) => s.status === 'cancelled').length > 0 && (
            <p className="text-xs text-center" style={{ color: '#94A3B8' }}>
              {schedules.filter((s) => s.status === 'cancelled').length} cancelled procedure(s) hidden
            </p>
          )}
        </div>
      )}

      <ScheduleModal
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
        rooms={rooms}
        doctors={doctors}
        defaultDate={date}
        onSuccess={() => { setShowSchedule(false); loadDay(date) }}
      />

      <RoomModal
        open={showRoom}
        onClose={() => setShowRoom(false)}
        onSuccess={(newRooms) => { setRooms(newRooms); setShowRoom(false) }}
      />

      {detailId && (
        <ScheduleDetailModal
          open={true}
          scheduleId={detailId}
          rooms={rooms}
          doctors={doctors}
          onClose={() => setDetailId(null)}
          onSuccess={() => { setDetailId(null); loadDay(date) }}
        />
      )}
    </div>
  )
}
