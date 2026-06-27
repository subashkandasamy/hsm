'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react'
import { verify2FA, resend2FA } from '@/app/actions/auth'

interface Props {
  hospitalName?: string | null
  maskedPhone?: string
}

export default function OtpEntryForm({ hospitalName, maskedPhone: initialMaskedPhone }: Props) {
  const router = useRouter()
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [cooldownMs, setCooldownMs] = useState(0)
  const [maskedPhone, setMaskedPhone] = useState(initialMaskedPhone ?? '')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (cooldownMs <= 0) return
    const t = setInterval(() => setCooldownMs((c) => Math.max(0, c - 1000)), 1000)
    return () => clearInterval(t)
  }, [cooldownMs])

  const code = digits.join('')

  const submitCode = useCallback(async (fullCode: string) => {
    setError(null)
    setLoading(true)
    const result = await verify2FA(fullCode)
    setLoading(false)

    if (result.status === 'verified') {
      router.push('/dashboard')
      router.refresh()
      return
    }

    setDigits(['', '', '', '', '', ''])
    inputRefs.current[0]?.focus()

    if (result.status === 'invalid') setError('Incorrect code. Please try again.')
    else if (result.status === 'expired') setError('This code has expired. Please request a new one.')
    else if (result.status === 'locked') setError('Too many incorrect attempts. Please sign in again.')
    else setError('Verification failed. Please try again.')
  }, [router])

  function handleDigitChange(index: number, value: string) {
    // Handle paste of full code
    if (value.length > 1) {
      const clean = value.replace(/\D/g, '').slice(0, 6)
      if (clean.length === 6) {
        const next = clean.split('')
        setDigits(next)
        inputRefs.current[5]?.focus()
        submitCode(clean)
        return
      }
    }

    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    const full = next.join('')
    if (full.length === 6) {
      submitCode(full)
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  async function handleResend() {
    setResendLoading(true)
    setError(null)
    const result = await resend2FA()
    setResendLoading(false)

    if (result.status === 'sent') {
      setMaskedPhone(result.maskedPhone)
      setCooldownMs(30_000)
      setDigits(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } else if (result.status === 'cooldown') {
      setCooldownMs(result.retryAfterMs)
    } else {
      setError(result.error)
    }
  }

  const cooldownSec = Math.ceil(cooldownMs / 1000)

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <ShieldCheck className="w-7 h-7" style={{ color: '#0D9488' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>
            {hospitalName ?? 'Uyirly'}
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#64748B' }}>Two-factor verification</p>
        </div>

        <div className="glass-card p-8">
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-sm" style={{ color: '#475569' }}>
                Enter the 6-digit code sent to{' '}
                <span className="font-mono font-semibold" style={{ color: '#0F172A' }}>
                  {maskedPhone || 'your phone'}
                </span>
              </p>
            </div>

            {/* 6-digit OTP input */}
            <div className="flex gap-2 justify-center">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={d}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onFocus={(e) => {
                    e.currentTarget.select()
                    e.currentTarget.style.borderColor = '#0D9488'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.15)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#E2E8F0'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                  className="rounded-xl text-center text-xl font-bold transition-all"
                  style={{
                    width: '3rem',
                    height: '3.5rem',
                    border: '2px solid #E2E8F0',
                    background: 'rgba(255,255,255,0.9)',
                    color: '#0F172A',
                    outline: 'none',
                  }}
                  autoFocus={i === 0}
                  autoComplete="one-time-code"
                  disabled={loading}
                />
              ))}
            </div>

            {/* Submit spinner overlay when auto-submitting */}
            {loading && (
              <div className="flex justify-center">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24" style={{ color: '#0D9488' }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm"
                style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {/* Manual submit button (visible if auto-submit didn't fire) */}
            {code.length === 6 && !loading && !error && (
              <button
                onClick={() => submitCode(code)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer', minHeight: '44px' }}
              >
                Verify code
              </button>
            )}

            {/* Resend */}
            <div className="text-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendLoading || cooldownMs > 0}
                className="inline-flex items-center gap-1.5 text-sm transition-all"
                style={{
                  color: (resendLoading || cooldownMs > 0) ? '#94A3B8' : '#0D9488',
                  background: 'none',
                  border: 'none',
                  cursor: (resendLoading || cooldownMs > 0) ? 'not-allowed' : 'pointer',
                }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resendLoading ? 'animate-spin' : ''}`} />
                {cooldownMs > 0 ? `Resend in ${cooldownSec}s` : 'Resend code'}
              </button>
            </div>

            <p className="text-center text-xs" style={{ color: '#94A3B8' }}>
              Code expires in 5 minutes. Didn&apos;t receive it? Check that your phone number is correct.
            </p>
          </div>
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: '#94A3B8' }}>
          {hospitalName ? `${hospitalName} — powered by ` : ''}<span style={{ color: '#0D9488' }}>Uyirly</span>
          {' '}&copy; {new Date().getFullYear()}
        </p>
      </div>
    </main>
  )
}
