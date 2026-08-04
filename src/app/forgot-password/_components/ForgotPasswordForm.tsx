'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import { requestPasswordReset } from '@/app/actions/auth'

interface Props { hospitalName?: string | null }

export default function ForgotPasswordForm({ hospitalName }: Props) {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    await requestPasswordReset(email)
    setLoading(false)
    setSubmitted(true)
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <span style={{ color: '#0D9488', fontSize: '32px', fontWeight: 800, lineHeight: 1 }}>U</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>
            {hospitalName ?? 'Uyirly'}
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#64748B' }}>Reset your password</p>
        </div>

        <div className="glass-card p-8">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle className="w-12 h-12" style={{ color: '#0D9488' }} />
              </div>
              <h2 className="text-lg font-semibold" style={{ color: '#0F172A' }}>Check your email</h2>
              <p className="text-sm" style={{ color: '#64748B' }}>
                If an account exists for <span className="font-medium" style={{ color: '#0F172A' }}>{email}</span>,
                we&apos;ve sent a password-reset link. It expires in 1 hour.
              </p>
              <p className="text-xs" style={{ color: '#94A3B8' }}>
                Didn&apos;t receive it? Check your spam folder, or wait 60 seconds and try again.
              </p>
              <Link href="/login"
                className="inline-flex items-center gap-2 text-sm font-medium mt-2"
                style={{ color: '#0D9488' }}>
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-sm" style={{ color: '#475569' }}>
                Enter the email address on your staff account. We&apos;ll send a reset link to that address.
              </p>

              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@hospital.com"
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
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: loading ? '#94A3B8' : '#0D9488',
                  color: '#fff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  border: 'none',
                  minHeight: '44px',
                }}
              >
                {loading ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : null}
                {loading ? 'Sending…' : 'Send reset link'}
              </button>

              <div className="text-center">
                <Link href="/login"
                  className="inline-flex items-center gap-1.5 text-sm"
                  style={{ color: '#64748B' }}>
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: '#94A3B8' }}>
          {hospitalName ? `${hospitalName} — powered by ` : ''}<span style={{ color: '#0D9488' }}>Uyirly</span>
          {' '}&copy; {new Date().getFullYear()}
        </p>
      </div>
    </main>
  )
}
