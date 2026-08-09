'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Gift, Mail, CheckCircle2 } from 'lucide-react'
import { requestPartnerLogin } from '@/app/actions/partnerAuth'

const TEAL = '#0D9488'

export default function PartnerLoginClient({ hadError }: { hadError?: boolean }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) return
    setLoading(true)
    await requestPartnerLogin(email)
    setLoading(false)
    setSent(true)
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F8FAFC' }}>
      <div className="w-full max-w-md rounded-2xl p-8" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(13,148,136,0.1)' }}>
            <Gift className="w-5 h-5" style={{ color: TEAL }} />
          </div>
          <div>
            <p className="text-base font-bold" style={{ color: '#0F172A' }}>Uyirly Partners</p>
            <p className="text-xs" style={{ color: '#94A3B8' }}>Referral partner sign-in</p>
          </div>
        </div>

        {sent ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#16A34A' }} />
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Check your email</p>
            <p className="text-sm mt-1" style={{ color: '#64748B' }}>
              If <strong>{email}</strong> is a registered partner, we&apos;ve sent a sign-in link. It expires in 30 minutes.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="text-sm mb-4" style={{ color: '#64748B' }}>Enter your email to get a one-time sign-in link.</p>
            {hadError && (
              <div className="text-sm rounded-xl px-3 py-2 mb-3" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                That sign-in link was invalid or expired — request a new one.
              </div>
            )}
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Email</label>
            <div className="relative mb-4">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
                className="w-full pl-10 pr-3 py-2.5 rounded-xl text-sm" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }} />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: loading ? '#94A3B8' : TEAL, color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
            <p className="text-xs text-center mt-3" style={{ color: '#94A3B8' }}>
              New here? <Link href="/partner/register" className="font-medium underline" style={{ color: TEAL }}>Become a partner</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  )
}
