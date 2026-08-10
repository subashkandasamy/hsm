'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Rocket, ChevronRight, Check, X } from 'lucide-react'
import { dismissSetupGuide, type SetupProgress } from '@/app/actions/setup'

const TEAL = '#0D9488'

export default function SetupProgressCard({ progress }: { progress: SetupProgress }) {
  const [dismissed, setDismissed] = useState(progress.dismissed)

  // Once every step is done there's nothing left to nudge about.
  if (progress.allDone) return null

  const pct = Math.round((progress.doneCount / progress.totalCount) * 100)
  const todo = progress.steps.filter((s) => !s.done).slice(0, 3)

  async function dismiss() {
    setDismissed(true)
    await dismissSetupGuide()
  }

  // After the full card is dismissed, keep a small persistent link on the
  // dashboard so the admin can always get back to finish setup.
  if (dismissed) {
    return (
      <Link href="/getting-started"
        className="glass-card flex items-center gap-3 px-4 py-3 mb-5 transition-all"
        style={{ borderColor: 'rgba(13,148,136,0.25)', textDecoration: 'none' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)' }}>
          <Rocket className="w-4 h-4" style={{ color: TEAL }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>Finish setting up your hospital</p>
          <p className="text-xs" style={{ color: '#64748B' }}>{progress.doneCount} of {progress.totalCount} steps done</p>
        </div>
        <div className="hidden sm:block w-24 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ background: '#E2E8F0' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: TEAL }} />
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: TEAL }} />
      </Link>
    )
  }

  return (
    <div className="glass-card p-5 mb-5" style={{ borderColor: 'rgba(13,148,136,0.25)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <Rocket className="w-5 h-5" style={{ color: TEAL }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: '#0F172A' }}>Finish setting up your hospital</p>
            <p className="text-xs" style={{ color: '#64748B' }}>{progress.doneCount} of {progress.totalCount} steps done</p>
          </div>
        </div>
        <button onClick={dismiss} title="Dismiss"
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg"
          style={{ color: '#94A3B8', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: '#E2E8F0' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: TEAL }} />
      </div>

      {/* Next steps */}
      <div className="mt-4 flex flex-col gap-2">
        {todo.map((step) => (
          <Link key={step.key} href={step.href}
            className="flex items-center gap-3 p-2.5 rounded-xl transition-all"
            style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid #E2E8F0', textDecoration: 'none' }}>
            <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ border: '1.5px solid #CBD5E1' }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{step.title}</p>
            </div>
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#CBD5E1' }} />
          </Link>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Link href="/getting-started"
          className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: TEAL }}>
          View full setup guide <ChevronRight className="w-4 h-4" />
        </Link>
        {progress.doneCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#16A34A' }}>
            <Check className="w-3.5 h-3.5" /> {progress.doneCount} done
          </span>
        )}
      </div>
    </div>
  )
}
