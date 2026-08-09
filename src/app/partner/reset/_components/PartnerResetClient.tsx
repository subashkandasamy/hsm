'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Gift, Lock } from 'lucide-react'
import { setPartnerPassword } from '@/app/actions/partnerAuth'

const TEAL = '#0D9488'
const inputStyle = { background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' } as const

export default function PartnerResetClient({ token }: { token: string }) {
  const router = useRouter()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pw.length < 8) { setError('Password must be at least 8 characters'); return }
    if (pw !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError(null)
    const res = await setPartnerPassword(token, pw)
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
          <p className="text-base font-bold" style={{ color: '#0F172A' }}>Set your password</p>
        </div>

        {!token ? (
          <div>
            <p className="text-sm" style={{ color: '#64748B' }}>This link is missing its token. Request a new one.</p>
            <Link href="/partner/forgot" className="inline-block mt-4 text-sm font-medium underline" style={{ color: TEAL }}>Get a reset link</Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            {error && <div className="text-sm rounded-xl px-3 py-2 mb-3" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>New password</label>
            <div className="relative mb-3">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" required
                className="w-full pl-10 pr-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
            </div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>Confirm password</label>
            <div className="relative mb-4">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" required
                className="w-full pl-10 pr-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: loading ? '#94A3B8' : TEAL, color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Saving…' : 'Set password & sign in'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
