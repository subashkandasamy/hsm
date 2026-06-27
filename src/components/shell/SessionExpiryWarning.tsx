'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, AlertTriangle } from 'lucide-react'
import { SESSION_MAX_MS, SESSION_WARN_MS } from '@/lib/sessionCookie'

interface Props {
  loginAtMs: number | null
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSec = Math.ceil(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export default function SessionExpiryWarning({ loginAtMs }: Props) {
  const router = useRouter()
  const [remainingMs, setRemainingMs] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!loginAtMs) return

    function calcRemaining() {
      const elapsed = Date.now() - loginAtMs!
      return Math.max(0, SESSION_MAX_MS - elapsed)
    }

    setRemainingMs(calcRemaining())

    const interval = setInterval(() => {
      const r = calcRemaining()
      setRemainingMs(r)
      if (r <= 0) {
        clearInterval(interval)
        // Session expired — next navigation will be caught by proxy
        router.refresh()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [loginAtMs, router])

  if (!loginAtMs || remainingMs === null) return null
  if (remainingMs > SESSION_WARN_MS) return null
  if (dismissed && remainingMs > 60_000) return null // allow re-show in last minute

  const isUrgent = remainingMs <= 2 * 60_000 // < 2 min

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-start gap-3 px-4 py-3 rounded-2xl shadow-lg text-sm"
      style={{
        background: isUrgent ? '#FEF2F2' : '#FFFBEB',
        border: `1px solid ${isUrgent ? '#FECACA' : '#FDE68A'}`,
        color: isUrgent ? '#991B1B' : '#92400E',
        maxWidth: 'calc(100vw - 2rem)',
        width: '26rem',
      }}
    >
      <div className="flex-shrink-0 mt-0.5">
        {isUrgent
          ? <AlertTriangle className="w-4 h-4" style={{ color: '#DC2626' }} />
          : <Clock className="w-4 h-4" style={{ color: '#D97706' }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">
          {isUrgent ? 'Session expiring now' : 'Session expiring soon'}
        </p>
        <p className="text-xs mt-0.5 opacity-80">
          {remainingMs > 0
            ? `Your session expires in ${formatRemaining(remainingMs)}. Please save any unsaved work.`
            : 'Your session has expired. Refreshing…'}
        </p>
      </div>
      {!isUrgent && (
        <button
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 text-xs font-medium opacity-60 hover:opacity-100"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
        >
          Dismiss
        </button>
      )}
    </div>
  )
}
