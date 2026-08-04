'use client'

import Link from 'next/link'
import { Check, ChevronRight, PartyPopper } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import type { SetupProgress } from '@/app/actions/setup'

const TEAL = '#0D9488'

export default function GettingStarted({ progress }: { progress: SetupProgress }) {
  const pct = Math.round((progress.doneCount / progress.totalCount) * 100)

  return (
    <div>
      <PageHeader
        title="Getting started"
        subtitle="A few quick steps to get your hospital fully set up and running on Uyirly."
      />

      {progress.allDone ? (
        <GlassCard className="p-8 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <PartyPopper className="w-7 h-7" style={{ color: TEAL }} />
          </div>
          <h2 className="text-lg font-bold mb-1" style={{ color: '#0F172A' }}>You&apos;re all set!</h2>
          <p className="text-sm mb-5" style={{ color: '#64748B' }}>
            Every setup step is done. Your hospital is fully configured and ready for day-to-day use.
          </p>
          <Link href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: TEAL, color: '#fff' }}>
            Go to dashboard <ChevronRight className="w-4 h-4" />
          </Link>
        </GlassCard>
      ) : (
        <>
          {/* Progress summary */}
          <GlassCard className="p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Your progress</p>
              <p className="text-sm font-bold" style={{ color: TEAL }}>{progress.doneCount} / {progress.totalCount}</p>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: '#E2E8F0' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: TEAL }} />
            </div>
          </GlassCard>

          {/* Steps */}
          <div className="flex flex-col gap-2.5">
            {progress.steps.map((step, i) => (
              <GlassCard key={step.key} className="p-4">
                <div className="flex items-center gap-3.5">
                  {/* Status */}
                  <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={step.done
                      ? { background: TEAL }
                      : { border: '1.5px solid #CBD5E1', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>
                    {step.done ? <Check className="w-4 h-4" style={{ color: '#fff' }} /> : i + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: step.done ? '#94A3B8' : '#0F172A', textDecoration: step.done ? 'line-through' : 'none' }}>
                      {step.title}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{step.description}</p>
                  </div>

                  {step.done ? (
                    <span className="flex-shrink-0 text-xs font-medium" style={{ color: '#16A34A' }}>Done</span>
                  ) : (
                    <Link href={step.href}
                      className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                      style={{ background: 'rgba(13,148,136,0.08)', color: TEAL, border: '1px solid rgba(13,148,136,0.15)' }}>
                      Set up <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
