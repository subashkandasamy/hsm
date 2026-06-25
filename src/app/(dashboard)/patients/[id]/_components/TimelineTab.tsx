'use client'

import { useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  Stethoscope, Siren, BedDouble, FlaskConical, Scan, Scissors, Droplets, FileText,
  Filter, X, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import DateText from '@/components/ui/DateText'
import EmptyState from '@/components/ui/EmptyState'
import { getPatientTimeline } from '@/app/actions/emr'
import type { TimelineEvent, TimelineEventType, DiagnosisSummary } from '@/lib/types'

const TYPE_META: Record<TimelineEventType, { label: string; icon: ReactNode; color: string; bg: string; href?: (id: string) => string }> = {
  opd_visit:       { label: 'OPD',       icon: <Stethoscope className="w-4 h-4" />, color: '#0D9488', bg: 'rgba(13,148,136,0.1)', href: (id) => `/opd/${id}` },
  emergency_visit: { label: 'Emergency', icon: <Siren className="w-4 h-4" />,       color: '#DC2626', bg: '#FEE2E2',             href: (id) => `/emergency` },
  admission:       { label: 'IPD',       icon: <BedDouble className="w-4 h-4" />,   color: '#7C3AED', bg: '#EDE9FE',             href: (id) => `/ipd/${id}` },
  lab_order:       { label: 'Lab',       icon: <FlaskConical className="w-4 h-4" />,color: '#0369A1', bg: '#E0F2FE',             href: (id) => `/lab/${id}` },
  radiology_order: { label: 'Radiology', icon: <Scan className="w-4 h-4" />,        color: '#059669', bg: '#D1FAE5',             href: (id) => `/radiology/${id}` },
  ot_schedule:     { label: 'OT',        icon: <Scissors className="w-4 h-4" />,    color: '#B45309', bg: '#FEF3C7',             href: (id) => `/ot` },
  blood_issue:     { label: 'Blood',     icon: <Droplets className="w-4 h-4" />,    color: '#BE123C', bg: '#FFE4E6' },
  document:        { label: 'Document',  icon: <FileText className="w-4 h-4" />,    color: '#475569', bg: '#F1F5F9' },
}

const ALL_TYPES: TimelineEventType[] = [
  'opd_visit', 'emergency_visit', 'admission',
  'lab_order', 'radiology_order', 'ot_schedule', 'blood_issue', 'document',
]

interface Props {
  patientId: string
  initialEvents: TimelineEvent[]
  diagnoses: DiagnosisSummary[]
}

export default function TimelineTab({ patientId, initialEvents, diagnoses }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents)
  const [selectedTypes, setSelectedTypes] = useState<TimelineEventType[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showAllDiagnoses, setShowAllDiagnoses] = useState(false)
  const [isPending, startTransition] = useTransition()

  function toggleType(t: TimelineEventType) {
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    )
  }

  function applyFilters() {
    startTransition(async () => {
      const results = await getPatientTimeline(patientId, {
        types: selectedTypes.length > 0 ? selectedTypes : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
      setEvents(results)
      setShowFilters(false)
    })
  }

  function clearFilters() {
    setSelectedTypes([])
    setDateFrom('')
    setDateTo('')
    startTransition(async () => {
      const results = await getPatientTimeline(patientId)
      setEvents(results)
    })
  }

  const hasFilters = selectedTypes.length > 0 || !!dateFrom || !!dateTo
  const visibleDiagnoses = showAllDiagnoses ? diagnoses : diagnoses.slice(0, 6)

  return (
    <div className="space-y-4">
      {/* Known diagnoses */}
      {diagnoses.length > 0 && (
        <GlassCard className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#94A3B8' }}>
            Known Conditions
          </p>
          <div className="flex flex-wrap gap-2">
            {visibleDiagnoses.map((d, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}>
                {d.diagnosis}
                {d.icd_code && (
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded"
                    style={{ background: '#DBEAFE', color: '#1D4ED8' }}>
                    {d.icd_code}
                  </span>
                )}
              </span>
            ))}
            {diagnoses.length > 6 && (
              <button
                onClick={() => setShowAllDiagnoses((v) => !v)}
                className="text-xs px-3 py-1.5 rounded-full"
                style={{ color: '#64748B', border: '1px solid #E2E8F0' }}
              >
                {showAllDiagnoses ? 'Show less' : `+${diagnoses.length - 6} more`}
              </button>
            )}
          </div>
        </GlassCard>
      )}

      {/* Filter bar */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
            Clinical Timeline
            {events.length > 0 && (
              <span className="ml-2 text-xs font-normal" style={{ color: '#94A3B8' }}>
                {events.length} event{events.length !== 1 ? 's' : ''}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <button onClick={clearFilters}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg min-h-[36px]"
                style={{ color: '#DC2626', border: '1px solid #FECACA', background: '#FEF2F2' }}>
                <X className="w-3 h-3" /> Clear
              </button>
            )}
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl min-h-[36px]"
              style={{
                background: hasFilters ? '#0D9488' : 'rgba(255,255,255,0.7)',
                color: hasFilters ? '#fff' : '#64748B',
                border: `1px solid ${hasFilters ? '#0D9488' : '#E2E8F0'}`,
              }}
            >
              <Filter className="w-3 h-3" /> Filter
              {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <GlassCard className="p-4 mb-3">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: '#64748B' }}>Event types</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_TYPES.map((t) => {
                    const meta = TYPE_META[t]
                    const active = selectedTypes.includes(t)
                    return (
                      <button key={t} onClick={() => toggleType(t)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium min-h-[36px]"
                        style={{
                          background: active ? meta.bg : 'rgba(255,255,255,0.5)',
                          color: active ? meta.color : '#64748B',
                          border: `1px solid ${active ? meta.color + '40' : '#E2E8F0'}`,
                        }}
                      >
                        {meta.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>From date</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-sm border min-h-[44px]"
                    style={{ border: '1px solid #E2E8F0', background: 'rgba(255,255,255,0.8)', color: '#0F172A', outline: 'none' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>To date</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-sm border min-h-[44px]"
                    style={{ border: '1px solid #E2E8F0', background: 'rgba(255,255,255,0.8)', color: '#0F172A', outline: 'none' }} />
                </div>
              </div>
              <button onClick={applyFilters} disabled={isPending}
                className="px-4 py-2 rounded-xl text-sm font-semibold min-h-[44px]"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: isPending ? 'not-allowed' : 'pointer' }}>
                {isPending ? 'Loading…' : 'Apply Filters'}
              </button>
            </div>
          </GlassCard>
        )}
      </div>

      {/* Timeline feed */}
      {isPending ? (
        <div className="text-center py-12" style={{ color: '#94A3B8' }}>Loading timeline…</div>
      ) : events.length === 0 ? (
        <EmptyState title="No events yet" description="Clinical events will appear here as the patient is seen across departments." />
      ) : (
        <div className="relative space-y-3 pl-6">
          {/* Vertical line */}
          <div className="absolute left-2.5 top-3 bottom-3 w-0.5" style={{ background: '#E2E8F0' }} />

          {events.map((event) => {
            const meta = TYPE_META[event.type]
            const isAbnormal = event.type === 'lab_order' && Boolean(event.meta?.hasAbnormal)
            const href = meta.href?.(event.refId)

            return (
              <div key={event.id} className="relative">
                {/* Dot */}
                <div className="absolute -left-[22px] top-3.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 z-10"
                  style={{ background: meta.bg, border: `2px solid ${meta.color}20`, color: meta.color }}>
                  <span style={{ transform: 'scale(0.65)' }}>{meta.icon}</span>
                </div>

                <GlassCard className="p-4" style={{ borderLeft: isAbnormal ? `3px solid #DC2626` : undefined }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: meta.bg, color: meta.color }}>
                          {meta.label}
                        </span>
                        {isAbnormal && (
                          <span className="flex items-center gap-1 text-xs font-semibold"
                            style={{ color: '#DC2626' }}>
                            <AlertTriangle className="w-3 h-3" /> Abnormal
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                        {event.title}
                      </p>
                      {event.summary && (
                        <p className="text-xs mt-0.5" style={{ color: '#475569' }}>{event.summary}</p>
                      )}
                      <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
                        <DateText date={event.date} />
                      </p>
                    </div>
                    {href && (
                      <Link href={href}
                        className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium min-h-[36px] flex items-center"
                        style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)', whiteSpace: 'nowrap' }}
                      >
                        View →
                      </Link>
                    )}
                  </div>
                </GlassCard>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
