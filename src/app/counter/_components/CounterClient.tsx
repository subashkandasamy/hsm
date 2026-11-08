'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock } from 'lucide-react'
import { setPinAtCounter, switchWithPin, type CounterStaff, type CounterState } from '@/app/actions/counter'
import { PIN_LENGTH, pinProblem } from '@/lib/pin'

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.96)', border: '1px solid #E2E8F0', boxShadow: '0 10px 40px rgba(15,23,42,0.08)' }
const input: React.CSSProperties = { background: '#fff', border: '1px solid #CBD5E1', color: '#0F172A', outline: 'none', minHeight: '44px' }

/** Tap your name, type your PIN — the counter is yours until you leave it. */
export default function CounterClient({ hospitalName, state }: { hospitalName: string | null; state: CounterState }) {
  const router = useRouter()
  const [who, setWho] = useState<CounterStaff | null>(null)
  const [pin, setPin] = useState('')
  const [password, setPassword] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newPin2, setNewPin2] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const pinRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (who?.hasPin && !who.locked) pinRef.current?.focus() }, [who])

  function pick(s: CounterStaff) { setWho(s); setPin(''); setPassword(''); setNewPin(''); setNewPin2(''); setError('') }
  function back() { setWho(null); setError('') }
  function done() { router.replace('/dashboard'); router.refresh() }

  function submitPin(value: string) {
    if (!who || value.length !== PIN_LENGTH) return
    setError('')
    startTransition(async () => {
      const res = await switchWithPin(who.id, value)
      if (res.success) return done()
      setPin(''); setError(res.error)
      if (/locked/i.test(res.error)) setWho({ ...who, locked: true })
      pinRef.current?.focus()
    })
  }

  function submitFirstPin() {
    if (!who) return
    const problem = pinProblem(newPin)
    if (problem) { setError(problem); return }
    if (newPin !== newPin2) { setError('The two PINs do not match.'); return }
    if (!password) { setError('Enter your password once to set your PIN.'); return }
    setError('')
    startTransition(async () => {
      const res = await setPinAtCounter(who.id, password, newPin)
      if (res.success) return done()
      setError(res.error)
    })
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(180deg,#F0FDFA,#F8FAFC)' }}>
      <div className="w-full max-w-xl rounded-3xl p-6 sm:p-8" style={card}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#0D9488' }}>{hospitalName ?? 'Uyirly'}</p>

        {!state.device ? (
          <>
            <h1 className="text-xl font-semibold mt-1" style={{ color: '#0F172A' }}>This computer is not a shared counter</h1>
            <p className="text-sm mt-2" style={{ color: '#64748B' }}>
              An admin can set it up under Settings → Shared counters. Until then, sign in with your email and password.
            </p>
            <a href="/login" className="inline-block mt-5 px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#0D9488', color: '#fff' }}>Sign in</a>
          </>
        ) : !who ? (
          <>
            <h1 className="text-xl font-semibold mt-1" style={{ color: '#0F172A' }}>Who is working?</h1>
            <p className="text-sm mt-1" style={{ color: '#64748B' }}>{state.device.name} · tap your name, then your PIN.</p>
            {state.device.paused && (
              <p className="text-sm mt-4 px-3 py-2 rounded-lg" style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                Too many wrong PINs here — the counter is paused for a few minutes. Sign in with a password meanwhile.
              </p>
            )}
            <div className="grid gap-2 mt-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {state.staff.map((s) => (
                <button key={s.id} type="button" onClick={() => pick(s)} disabled={state.device!.paused}
                  className="text-left px-3 py-3 rounded-2xl"
                  style={{ background: '#fff', border: '1px solid #E2E8F0', opacity: state.device!.paused ? 0.5 : 1 }}>
                  <span className="block text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{s.name}</span>
                  <span className="block text-xs mt-0.5" style={{ color: s.locked ? '#B45309' : '#64748B' }}>
                    {s.role}{s.locked ? ' · PIN locked' : !s.hasPin ? ' · set a PIN' : ''}
                  </span>
                </button>
              ))}
            </div>
            {state.staff.length === 0 && <p className="text-sm mt-4" style={{ color: '#64748B' }}>No staff accounts yet.</p>}
            <a href="/login" className="inline-block mt-6 text-sm font-medium" style={{ color: '#0D9488' }}>Sign in with email and password instead</a>
          </>
        ) : (
          <>
            <button type="button" onClick={back} className="flex items-center gap-1 text-sm mt-1" style={{ color: '#64748B' }}>
              <ArrowLeft className="w-4 h-4" /> Not you?
            </button>
            <h1 className="text-xl font-semibold mt-2" style={{ color: '#0F172A' }}>{who.name}</h1>

            {who.locked ? (
              <div className="mt-4 flex items-start gap-2 px-3 py-3 rounded-xl text-sm" style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
                Your PIN is locked after too many wrong tries. Ask an admin to reset it, or sign in with your password.
              </div>
            ) : who.hasPin ? (
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2" style={{ color: '#475569' }}>Your {PIN_LENGTH}-digit PIN</label>
                <input ref={pinRef} type="password" inputMode="numeric" autoComplete="off" maxLength={PIN_LENGTH} value={pin} disabled={isPending}
                  onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH); setPin(v); if (v.length === PIN_LENGTH) submitPin(v) }}
                  className="w-40 px-4 rounded-xl text-2xl tracking-[0.6em] text-center" style={input} aria-label="PIN" />
                <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>{isPending ? 'Checking…' : 'It goes through on the last digit.'}</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3 max-w-xs">
                <p className="text-sm" style={{ color: '#64748B' }}>First time here: confirm your password once, then choose a {PIN_LENGTH}-digit PIN.</p>
                <input type="password" autoComplete="current-password" placeholder="Your password" value={password}
                  onChange={(e) => setPassword(e.target.value)} className="w-full px-3 rounded-xl text-sm" style={input} />
                <input type="password" inputMode="numeric" autoComplete="off" maxLength={PIN_LENGTH} placeholder="New PIN" value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))} className="w-full px-3 rounded-xl text-sm" style={input} />
                <input type="password" inputMode="numeric" autoComplete="off" maxLength={PIN_LENGTH} placeholder="New PIN again" value={newPin2}
                  onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))} className="w-full px-3 rounded-xl text-sm" style={input} />
                <button type="button" onClick={submitFirstPin} disabled={isPending}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: isPending ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none' }}>
                  {isPending ? 'Setting up…' : 'Set PIN and start'}
                </button>
              </div>
            )}

            {error && <p role="alert" className="mt-4 text-sm px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</p>}
          </>
        )}
      </div>
    </main>
  )
}
