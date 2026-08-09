'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Gift, Mail, CheckCircle2 } from 'lucide-react'
import { requestPartnerPasswordReset } from '@/app/actions/partnerAuth'

const TEAL = '#0D9488'
const inputStyle = { background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' } as const

export default function PartnerForgotClient() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) return
    setLoading(true)
    await requestPartnerPasswordReset(email)
    setLoading(false); setSent(true)
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F8FAFC' }}>
      <div className="w-full max-w-md rounded-2xl p-8" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(13,148,136,0.1)' }}>
            <Gift className="w-5 h-5" style={{ color: TEAL }} />
          </div>
          <p className="text-base font-bold" style={{ color: '#0F172A' }}>Reset your password</p>
        </div>

        {sent ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#16A34A' }} />
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Check your email</p>
            <p className="text-sm mt-1" style={{ color: '#64748B' }}>If <strong>{email}</strong> is a partner, we&apos;ve sent a link to set a new password. It expires in 1 hour.</p>
            <Link href="/partner/login" className="inline-block mt-4 text-sm font-medium underline" style={{ color: TEAL }}>Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="text-sm mb-4" style={{ color: '#64748B' }}>Enter your email and we&apos;ll send you a link to set a new password.</p>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Email</label>
            <div className="relative mb-4">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
                className="w-full pl-10 pr-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: loading ? '#94A3B8' : TEAL, color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <p className="text-xs text-center mt-3"><Link href="/partner/login" className="font-medium underline" style={{ color: '#64748B' }}>Back to sign in</Link></p>
          </form>
        )}
      </div>
    </main>
  )
}
