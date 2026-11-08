'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { setMyPin } from '@/app/actions/counter'
import { PIN_LENGTH, pinProblem } from '@/lib/pin'

const input: React.CSSProperties = { background: '#fff', border: '1px solid #CBD5E1', color: '#0F172A', outline: 'none', minHeight: '44px' }

export default function MyPinClient({ status }: { status: { eligible: boolean; hasPin: boolean; locked: boolean } }) {
  const [hasPin, setHasPin] = useState(status.hasPin)
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (!status.eligible) {
    return (
      <GlassCard className="p-6 max-w-lg">
        <p className="text-sm" style={{ color: '#475569' }}>Admins always sign in with their password, so there is no PIN to set.</p>
      </GlassCard>
    )
  }

  function save() {
    const problem = pinProblem(pin)
    if (problem) { setError(problem); return }
    if (pin !== pin2) { setError('The two PINs do not match.'); return }
    if (!password) { setError('Enter your password to confirm it is you.'); return }
    setError(''); setSaved(false)
    startTransition(async () => {
      const res = await setMyPin(password, pin)
      if (!res.success) { setError(res.error); return }
      setHasPin(true); setSaved(true); setPassword(''); setPin(''); setPin2('')
    })
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, PIN_LENGTH)

  return (
    <GlassCard className="max-w-lg">
      <div className="p-6 space-y-3">
        <p className="text-sm" style={{ color: '#475569' }}>
          {status.locked && !saved ? 'Your PIN is locked after too many wrong tries. Choose a new one below to unlock it.'
            : hasPin ? 'You have a PIN. You can change it here.' : 'You have no PIN yet.'}
        </p>
        <input type="password" autoComplete="current-password" placeholder="Your password" value={password}
          onChange={(e) => setPassword(e.target.value)} className="w-full px-3 rounded-xl text-sm" style={input} />
        <div className="grid grid-cols-2 gap-2">
          <input type="password" inputMode="numeric" autoComplete="off" placeholder={`New ${PIN_LENGTH}-digit PIN`} value={pin}
            onChange={(e) => setPin(digits(e.target.value))} className="px-3 rounded-xl text-sm" style={input} />
          <input type="password" inputMode="numeric" autoComplete="off" placeholder="Again" value={pin2}
            onChange={(e) => setPin2(digits(e.target.value))} className="px-3 rounded-xl text-sm" style={input} />
        </div>
        <button type="button" onClick={save} disabled={isPending}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: isPending ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none' }}>
          {hasPin ? 'Change PIN' : 'Set PIN'}
        </button>
        {saved && <p className="flex items-center gap-1 text-sm" style={{ color: '#047857' }}><Check className="w-4 h-4" /> Saved. Use it on any shared counter at your hospital.</p>}
        {error && <p className="text-sm px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</p>}
        <p className="text-xs pt-2" style={{ color: '#94A3B8' }}>
          Nobody else can see your PIN — not even an admin. It works only on computers your admin approved as shared counters.
        </p>
      </div>
    </GlassCard>
  )
}
