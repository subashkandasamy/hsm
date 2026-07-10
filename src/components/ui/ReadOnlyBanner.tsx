'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { useIsReadOnly } from '@/context/ReadOnlyContext'

export default function ReadOnlyBanner() {
  const isReadOnly = useIsReadOnly()
  if (!isReadOnly) return null

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 text-xs font-medium"
      style={{ background: '#FEF3C7', borderBottom: '1px solid #FDE68A', color: '#92400E' }}
    >
      <div className="flex items-center gap-2">
        <Lock className="w-3.5 h-3.5 shrink-0" />
        <span>Your subscription has ended — the app is in read-only mode. No new data can be created or edited.</span>
      </div>
      <Link
        href="/account/subscription"
        className="shrink-0 rounded-md px-3 py-1 text-xs font-semibold"
        style={{ background: '#D97706', color: '#fff' }}
      >
        Renew now
      </Link>
    </div>
  )
}
