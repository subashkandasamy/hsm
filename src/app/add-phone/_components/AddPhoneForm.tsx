'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Smartphone, AlertCircle } from 'lucide-react'
import { addPhoneAndSend } from '@/app/actions/auth'
import OtpEntryForm from '@/app/verify-otp/_components/OtpEntryForm'

interface Props { hospitalName?: string | null }

export default function AddPhoneForm({ hospitalName }: Props) {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [maskedPhone, setMaskedPhone] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await addPhoneAndSend(phone)
    setLoading(false)

    if (result.status === 'otp_sent') {
      setMaskedPhone(result.maskedPhone)
      setOtpSent(true)
    } else if (result.status === 'no_phone') {
      setError('Please enter a valid phone number.')
    } else {
      setError(('error' in result ? result.error : null) ?? 'Something went wrong. Please try again.')
    }
  }

  if (otpSent) {
    return <OtpEntryForm hospitalName={hospitalName} maskedPhone={maskedPhone} />
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <Smartphone className="w-7 h-7" style={{ color: '#0D9488' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>
            {hospitalName ?? 'Uyirly'}
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#64748B' }}>Add your phone number</p>
        </div>

        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="p-4 rounded-xl text-sm"
              style={{ background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.15)', color: '#0F6B63' }}>
              Your account requires two-factor authentication (2FA) for security.
              Add your mobile number to receive a one-time login code each time you sign in.
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
                Mobile phone number
              </label>
              <div className="relative">
                <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl text-sm transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.8)',
                    border: '1px solid #E2E8F0',
                    color: '#0F172A',
                    outline: 'none',
                    minHeight: '44px',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.1)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
              <p className="mt-1.5 text-xs" style={{ color: '#94A3B8' }}>
                Include country code (e.g. +91 for India). Standard SMS rates apply.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm"
                style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: loading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', minHeight: '44px' }}
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : null}
              {loading ? 'Sending code…' : 'Send verification code'}
            </button>

            <p className="text-center text-xs" style={{ color: '#94A3B8' }}>
              Contact your administrator if you cannot receive SMS on the registered number.
            </p>
          </form>
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: '#94A3B8' }}>
          {hospitalName ? `${hospitalName} — powered by ` : ''}<span style={{ color: '#0D9488' }}>Uyirly</span>
          {' '}&copy; {new Date().getFullYear()}
        </p>
      </div>
    </main>
  )
}
