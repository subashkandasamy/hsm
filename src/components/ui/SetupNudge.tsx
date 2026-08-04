'use client'

import Link from 'next/link'
import { Rocket, ChevronRight } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

// A small admin-only prompt shown on a setup page when its key list is still
// empty, linking back to the getting-started guide. Non-admins never see it
// (they can't do setup). Parent decides *when* to show it (list is empty).
export default function SetupNudge({ message }: { message: string }) {
  const { profile } = useAuth()
  if (profile?.role !== 'admin') return null

  return (
    <Link
      href="/getting-started"
      className="flex items-center gap-3 p-3.5 rounded-xl mb-4"
      style={{ background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.2)', textDecoration: 'none' }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)' }}>
        <Rocket className="w-4.5 h-4.5" style={{ color: '#0D9488', width: 18, height: 18 }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{message}</p>
        <p className="text-xs" style={{ color: '#64748B' }}>Part of your hospital setup — open the getting-started guide.</p>
      </div>
      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#0D9488' }} />
    </Link>
  )
}
