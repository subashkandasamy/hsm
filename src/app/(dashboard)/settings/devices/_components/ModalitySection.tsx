'use client'

import { useTransition } from 'react'
import { ScanLine, Play, Pause } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import { setModalityStatus, type ModalityRow } from '@/app/actions/devices'

/**
 * The scanners.
 *
 * Deliberately the same shape as the analyzer list, because to a hospital
 * these are the same kind of thing: a machine on the network that introduces
 * itself the first time it sends something.
 *
 * Until this existed the row went into the database and nothing in the product
 * ever showed it. A radiology department could not tell whether its CT was
 * connected, when it last sent a study, or how to stop it — while the
 * laboratory had a full screen for exactly those questions.
 */
export default function ModalitySection({
  modalities, onChange,
}: {
  modalities: ModalityRow[]
  onChange: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function toggle(m: ModalityRow) {
    const next = m.status === 'live' ? 'paused' : 'live'
    startTransition(async () => {
      await setModalityStatus(m.id, next)
      onChange()
    })
  }

  return (
    <section className="mb-6">
      <div className="mb-3">
        <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>Scanners</h2>
        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
          Ultrasound, X-ray and CT machines. They appear here on their own, the first
          time they send a study.
        </p>
      </div>

      {modalities.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<ScanLine className="w-6 h-6" style={{ color: '#94A3B8' }} />}
            title="No scanner has sent a study yet"
            description="Give your engineer the DICOM address and AE title shown on the lab computer above. The machine will appear here the first time it sends something."
          />
        </GlassCard>
      ) : (
        <div className="grid gap-3">
          {modalities.map((m) => {
            const name = [m.manufacturer, m.model].filter(Boolean).join(' ') || m.ae_title
            const live = m.status === 'live'
            return (
              <GlassCard key={m.id} className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: live ? 'rgba(13,148,136,0.08)' : '#F1F5F9' }}>
                    <ScanLine className="w-4 h-4" style={{ color: live ? '#0D9488' : '#94A3B8' }} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{name}</p>
                      <ModalityPill status={m.status} />
                    </div>

                    <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                      {modalityLabel(m.modality)}
                      {m.station_name ? ` · ${m.station_name}` : ''}
                      {m.last_study_at ? ` · last study ${timeAgo(m.last_study_at)}` : ' · nothing received yet'}
                    </p>

                    <p className="text-xs mt-1 font-mono" style={{ color: '#64748B' }}>
                      AE title {m.ae_title}
                      {m.studies > 0 && (
                        <span className="font-sans"> · {m.studies} stud{m.studies === 1 ? 'y' : 'ies'} received</span>
                      )}
                    </p>

                    {m.status === 'discovered' && (
                      <p className="text-xs mt-2" style={{ color: '#64748B' }}>
                        Found automatically. Check it is the machine you expect, then switch it on.
                      </p>
                    )}
                  </div>

                  <button onClick={() => toggle(m)} disabled={isPending}
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

/** DICOM says "US" and "CR". A radiographer should not have to translate. */
function modalityLabel(code: string | null): string {
  const map: Record<string, string> = {
    US: 'Ultrasound', CT: 'CT', MR: 'MRI', CR: 'X-ray (computed)',
    DX: 'X-ray (digital)', XA: 'Angiography', MG: 'Mammography',
    NM: 'Nuclear medicine', PT: 'PET', RF: 'Fluoroscopy', OT: 'Other',
  }
  if (!code) return 'Unknown type'
  return map[code.toUpperCase()] ?? code.toUpperCase()
}

function ModalityPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    live:       { bg: '#ECFDF5', fg: '#047857', label: 'On' },
    discovered: { bg: '#FEF3C7', fg: '#B45309', label: 'Newly found' },
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
