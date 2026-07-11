'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, RefreshCw, Scissors } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import Select from '@/components/ui/Select'
import { listSchedules } from '@/app/actions/ot'
import type { OtRoom, OtSchedule, Profile } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'

const STATUS_MAP: Record<string, string> = {
  scheduled: 'pending', in_progress: 'info', completed: 'success', cancelled: 'cancelled',
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#BFDBFE', in_progress: '#FDE68A', completed: '#BBF7D0', cancelled: '#E2E8F0',
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
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + n))
  return date.toISOString().split('T')[0]
}

export default function OtClient({ initialSchedules, rooms: initRooms, doctors, initialDate }: Props) {
  const router = useRouter()
  const { profile } = useAuth()
  const canManage = !!profile && hasPermission(profile.role, 'ot:manage')

  const [tab, setTab]         = useState<'active' | 'history'>('active')
  const [date, setDate]       = useState(initialDate)
  const [schedules, setSchedules] = useState<OtSchedule[]>(initialSchedules)
  const [rooms]               = useState<OtRoom[]>(initRooms)
  const [loading, setLoading] = useState(false)

  // Client-side filters
  const [filterRoom, setFilterRoom]     = useState('')
  const [filterDoctor, setFilterDoctor] = useState('')

  async function loadDay(d: string, t: 'active' | 'history' = tab) {
    setLoading(true)
    const s = await listSchedules({ date: d, tab: t })
    setSchedules(s)
    setLoading(false)
  }

  function navigate(n: number) {
    const next = addDays(date, n)
    setDate(next)
    loadDay(next)
  }

  function switchTab(t: 'active' | 'history') {
    setTab(t)
    loadDay(date, t)
  }

  const isToday = date === new Date().toISOString().split('T')[0]

  const filtered = schedules
    .filter(s => !filterRoom   || s.ot_room_id === filterRoom)
    .filter(s => !filterDoctor || s.surgeon_id === filterDoctor)

  return (
    <div>
      <PageHeader
        title="Operation Theatre"
        subtitle="Surgical scheduling and theatre management"
        action={
          <button onClick={() => loadDay(date)} className="p-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* Date picker */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
          <ChevronLeft className="w-4 h-4" style={{ color: '#64748B' }} />
        </button>
        <input
          type="date"
          value={date}
          onChange={e => { if (e.target.value) { setDate(e.target.value); loadDay(e.target.value) } }}
          className="text-sm font-semibold rounded-xl px-3 py-1.5 flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', cursor: 'pointer' }}
        />
        <button onClick={() => navigate(1)} className="p-1.5 rounded-lg flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
          <ChevronRight className="w-4 h-4" style={{ color: '#64748B' }} />
        </button>
        {!isToday && (
          <button onClick={() => { const t = new Date().toISOString().split('T')[0]; setDate(t); loadDay(t) }}
            className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)', cursor: 'pointer' }}>
            Today
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid #E2E8F0', width: 'fit-content' }}>
        {(['active', 'history'] as const).map(t => (
          <button key={t} onClick={() => switchTab(t)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all"
            style={{
              background: tab === t ? '#0D9488' : 'transparent',
              color: tab === t ? '#fff' : '#64748B',
              border: 'none', cursor: 'pointer',
            }}>
            {t === 'active' ? 'Active' : 'History'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div style={{ minWidth: '10rem', flex: '1 1 10rem', maxWidth: '14rem' }}>
          <Select value={filterRoom} onChange={e => setFilterRoom(e.target.value)}>
            <option value="">All Rooms</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </div>
        <div style={{ minWidth: '10rem', flex: '1 1 10rem', maxWidth: '14rem' }}>
          <Select value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)}>
            <option value="">All Surgeons</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </Select>
        </div>
      </div>

      {/* Schedule list */}
      {filtered.length === 0 ? (
        <GlassCard className="p-8">
          <EmptyState
            title={tab === 'active' ? 'No active surgeries' : 'No history for this day'}
            description={tab === 'active' ? 'Schedule surgeries from the patient\'s IPD admission page.' : 'Completed and cancelled surgeries will appear here.'}
            icon={<Scissors className="w-6 h-6" style={{ color: '#94A3B8' }} />}
          />
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden">
          <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
            {filtered.map(s => (
              <button key={s.id} onClick={() => router.push(`/ot/${s.id}`)}
                className="w-full text-left px-5 py-4 flex items-start gap-4"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(13,148,136,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>

                {/* Color bar */}
                <div className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5"
                  style={{ background: STATUS_COLORS[s.status] ?? '#E2E8F0' }} />

                {/* Time */}
                <div className="flex-shrink-0 w-20 text-right">
                  <p className="text-xs font-semibold" style={{ color: '#0F172A' }}>{fmtTime(s.scheduled_start)}</p>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>{fmtTime(s.scheduled_end)}</p>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{s.procedure_name}</p>
                    <StatusBadge status={STATUS_MAP[s.status] ?? 'pending'} label={s.status.replace('_', ' ')} />
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
                    {s.patient?.full_name}
                    {s.patient?.uhid && <span className="font-mono ml-1.5" style={{ color: '#94A3B8' }}>{s.patient.uhid}</span>}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                    Surgeon: {s.surgeon?.full_name ?? '—'}
                    {s.anaesthetist && <> · Anaest: {s.anaesthetist.full_name}</>}
                    {s.room && <> · <span style={{ color: '#0D9488' }}>{s.room.name}</span></>}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </GlassCard>
      )}

    </div>
  )
}
