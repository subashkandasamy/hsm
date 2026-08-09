'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Gift, Mail, Lock } from 'lucide-react'
import { loginPartner } from '@/app/actions/partnerAuth'

const TEAL = '#0D9488'
const inputStyle = { background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' } as const

export default function PartnerLoginClient({ hadError }: { hadError?: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(hadError ? 'That link was invalid or expired — sign in below.' : null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const res = await loginPartner(email, password)
    if (!res.success) { setError(res.error); setLoading(false); return }
    router.push('/partner')
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
            <p className="text-xs" style={{ color: '#94A3B8' }}>Sign in to your dashboard</p>
          </div>
        </div>

        <form onSubmit={submit}>
          {error && (
            <div className="text-sm rounded-xl px-3 py-2 mb-3" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>
          )}
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Email</label>
          <div className="relative mb-3">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
              className="w-full pl-10 pr-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
          </div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Password</label>
          <div className="relative mb-4">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" required
              className="w-full pl-10 pr-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: loading ? '#94A3B8' : TEAL, color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="flex items-center justify-between mt-3 text-xs">
            <Link href="/partner/forgot" className="font-medium underline" style={{ color: '#64748B' }}>Forgot password?</Link>
            <Link href="/partner/register" className="font-medium underline" style={{ color: TEAL }}>Become a partner</Link>
          </div>
        </form>
      </div>
    </main>
  )
}
