'use client'

import Link from 'next/link'
import { PlugZap } from 'lucide-react'
import type { SilentAnalyzer } from '@/lib/lab/silent'

/**
 * An analyzer that has stopped sending.
 *
 * On the laboratory worklist rather than in settings, because this is a
 * message for whoever is running the bench today and nobody goes to settings
 * unless something has already gone wrong.
 *
 * What it is really warning about is not the machine but the results: an
 * analyzer transmits once and forgets, so anything it measured while the link
 * was down is sitting in its own memory and will have to be sent again. The
 * wording says that, because "analyzer offline" tells a technician nothing
 * they can act on.
 *
 * Renders nothing when everything is talking, and nothing outside the working
 * day — a warning that is always on is a warning nobody reads.
 */
export default function SilentAnalyzerBar({ items }: { items: SilentAnalyzer[] }) {
  if (items.length === 0) return null

  return (
    <div className="rounded-xl px-4 py-3 mb-4"
      style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
      <div className="flex items-start gap-2.5">
        <PlugZap className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#B45309' }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: '#92400E' }}>
            {items.length === 1
              ? 'An analyzer has stopped sending results'
              : `${items.length} analyzers have stopped sending results`}
          </p>

          <ul className="mt-1 space-y-0.5">
            {items.map((a) => (
              <li key={a.id} className="text-xs" style={{ color: '#92400E' }}>
                <span className="font-semibold">{a.label}</span>
                {' — '}
                {a.hours_silent < 0
                  ? 'has never sent anything'
                  : `nothing for ${a.hours_silent} hour${a.hours_silent === 1 ? '' : 's'}`}
                {a.transport === 'serial' ? ' · on a cable' : a.transport === 'tcp' ? ' · over the network' : ''}
              </li>
            ))}
          </ul>

          <p className="text-xs mt-1.5" style={{ color: '#B45309' }}>
            Anything measured while it was disconnected is still on the machine and
            will need sending again — check its own memory before re-running a sample.
            {' '}
            <Link href="/settings/devices" style={{ color: '#92400E', fontWeight: 600 }}>
              Check the connection
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
