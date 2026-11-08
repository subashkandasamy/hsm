'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { signOutHere } from '@/app/actions/counter'
import { COUNTER_IDLE_MINUTES } from '@/lib/pin'

/** Minutes without use before an ordinary sign-in ends. */
export const IDLE_MINUTES = 10
const WARN_SECONDS = 60
/** Shared across tabs: activity in any Uyirly tab keeps them all signed in. */
const KEY = 'uyirly:last-activity'

function readLast(): number {
  try { return Number(localStorage.getItem(KEY)) || Date.now() } catch { return Date.now() }
}
function writeLast(t: number) {
  try { localStorage.setItem(KEY, String(t)) } catch { /* private mode: this tab only */ }
}

/**
 * Signs out a screen left unused. A minute before, a bar asks "Still there?",
 * so nobody loses a half-typed note to a timer. On a shared counter it locks
 * sooner and returns to the PIN screen; elsewhere it goes to the login page,
 * which says why.
 */
export default function IdleSignOut({ sharedCounter }: { sharedCounter: boolean }) {
  const router = useRouter()
  const limitMs = (sharedCounter ? COUNTER_IDLE_MINUTES : IDLE_MINUTES) * 60_000
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const signingOut = useRef(false)
  const lastWrite = useRef(0)

  const touch = useCallback(() => {
    const now = Date.now()
    if (now - lastWrite.current < 5_000) return     // a mouse moving is many events; one write in 5 s is enough
    lastWrite.current = now
    writeLast(now)
    setSecondsLeft(null)
  }, [])

  const signOut = useCallback(async () => {
    if (signingOut.current) return
    signingOut.current = true
    await signOutHere().catch(() => {})
    await createClient().auth.signOut({ scope: 'local' }).catch(() => {})
    router.replace(sharedCounter ? '/counter' : '/login?idle=1')
    router.refresh()
  }, [router, sharedCounter])

  useEffect(() => {
    writeLast(Date.now())
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const tick = setInterval(() => {
      const idle = Date.now() - readLast()
      if (idle >= limitMs) { void signOut(); return }
      const left = Math.ceil((limitMs - idle) / 1000)
      setSecondsLeft(left <= WARN_SECONDS ? left : null)
    }, 1_000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch))
      clearInterval(tick)
    }
  }, [limitMs, signOut, touch])

  if (secondsLeft === null) return null
  return (
    <div role="alertdialog" aria-live="assertive"
      className="fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-6 z-[60] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg"
      style={{ background: '#0F172A', color: '#fff', maxWidth: 'calc(100vw - 32px)' }}>
      <span className="text-sm">
        {sharedCounter ? 'This counter locks' : 'You will be signed out'} in <strong className="tabular-nums">{secondsLeft}s</strong> — no activity for a while.
      </span>
      <button type="button" onClick={() => { lastWrite.current = 0; touch() }}
        className="px-3 py-1.5 rounded-lg text-sm font-semibold flex-shrink-0" style={{ background: '#14B8A6', color: '#0F172A', border: 'none' }}>
        Stay signed in
      </button>
    </div>
  )
}
