'use client'

import { useTransition } from 'react'
import { Microscope, Play, Pause, AlertCircle } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import { setAnalyzerStatus, type AnalyzerRow } from '@/app/actions/devices'

/**
 * The machines themselves.
 *
 * Nothing here is typed in by a hospital. An analyzer appears the first time it
 * sends anything, already carrying its own name — instruments announce
 * themselves in the message header, which is what makes this list discovered
 * rather than configured.
 *
 * It arrives switched off. Going live is a person deciding they have looked at
 * what this machine sends, and it is a decision about trust in the instrument,
 * not about releasing results — those still need authorising either way.
 */
export default function AnalyzerSection({
  analyzers, onChange,
}: {
  analyzers: AnalyzerRow[]
  onChange: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function toggle(a: AnalyzerRow) {
    const next = a.status === 'live' ? 'paused' : 'live'
    startTransition(async () => {
      await setAnalyzerStatus(a.id, next)
      onChange()
    })
  }

  return (
    <section className="mb-6">
      <div className="mb-3">
        <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>Analyzers</h2>
        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
          Machines appear here on their own, the first time they send something.
        </p>
      </div>

      {analyzers.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<Microscope className="w-6 h-6" style={{ color: '#94A3B8' }} />}
            title="No analyzer has reported yet"
            description="Once the lab computer is set up and an analyzer sends its first sample, it will show up here by itself."
          />
        </GlassCard>
      ) : (
        <div className="grid gap-3">
          {analyzers.map((a) => {
            const name = [a.manufacturer, a.model].filter(Boolean).join(' ') || a.fingerprint || 'Unidentified analyzer'
            const live = a.status === 'live'
            return (
              <GlassCard key={a.id} className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: live ? 'rgba(13,148,136,0.08)' : '#F1F5F9' }}>
                    <Microscope className="w-4 h-4" style={{ color: live ? '#0D9488' : '#94A3B8' }} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{name}</p>
                      <AnalyzerPill status={a.status} />
                    </div>

                    <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                      {(a.protocol ?? '').toUpperCase()}
                      {a.transport ? ` over ${a.transport === 'tcp' ? 'network' : a.transport}` : ''}
                      {a.last_message_at ? ` · last sent ${timeAgo(a.last_message_at)}` : ' · nothing received yet'}
                    </p>

                    {a.unknown_codes > 0 && (
                      <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: '#B45309' }}>
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        {a.unknown_codes} measurement{a.unknown_codes > 1 ? 's' : ''} it sends
                        {a.unknown_codes > 1 ? ' are' : ' is'} not recognised yet — see below.
                      </p>
                    )}

                    {a.status === 'discovered' && (
                      <p className="text-xs mt-2" style={{ color: '#64748B' }}>
                        Found automatically. Check the measurements below look right, then switch it on.
                      </p>
                    )}
                  </div>

                  <button onClick={() => toggle(a)} disabled={isPending}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
                    style={{
                      background: live ? '#F1F5F9' : '#0D9488',
                      color: live ? '#475569' : '#fff',
                      border: live ? '1px solid #E2E8F0' : 'none',
                      cursor: isPending ? 'not-allowed' : 'pointer',
                    }}>
                    {live ? <><Pause className="w-3 h-3" /> Pause</> : <><Play className="w-3 h-3" /> Switch on</>}
                  </button>
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}
    </section>
  )
}

function AnalyzerPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    live:       { bg: '#ECFDF5', fg: '#047857', label: 'On' },
    discovered: { bg: '#FEF3C7', fg: '#B45309', label: 'Newly found' },
    quarantine: { bg: '#FEF3C7', fg: '#B45309', label: 'Being checked' },
    paused:     { bg: '#F1F5F9', fg: '#64748B', label: 'Paused' },
  }
  const s = map[status] ?? map.paused
  return (
    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
      style={{ background: s.bg, color: s.fg }}>{s.label}</span>
  )
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}
