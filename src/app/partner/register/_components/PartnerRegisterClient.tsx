'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Gift, CheckCircle2 } from 'lucide-react'
import { registerPartner } from '@/app/actions/partnerAuth'
import { DEFAULT_COMMISSION_PCT } from '@/lib/referral'

const TEAL = '#0D9488'
const inputStyle = { background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' } as const

export default function PartnerRegisterClient() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '', note: '' })
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError(null)
    const res = await registerPartner({ name: form.name, email: form.email, phone: form.phone, password: form.password, note: form.note })
    setLoading(false)
    if (!res.success) { setError(res.error); return }
    setDone(true)
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 py-10" style={{ background: '#F8FAFC' }}>
      <div className="w-full max-w-lg rounded-2xl p-8" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(13,148,136,0.1)' }}>
            <Gift className="w-5 h-5" style={{ color: TEAL }} />
          </div>
          <div>
            <p className="text-base font-bold" style={{ color: '#0F172A' }}>Become a Uyirly partner</p>
            <p className="text-xs" style={{ color: '#94A3B8' }}>Refer hospitals · earn {DEFAULT_COMMISSION_PCT}% recurring</p>
          </div>
        </div>

        {done ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#16A34A' }} />
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Application received</p>
            <p className="text-sm mt-1 max-w-sm mx-auto" style={{ color: '#64748B' }}>
              Thanks! Our team will review your application. Once approved, we&apos;ll email your referral link and dashboard access.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm mb-1" style={{ color: '#64748B' }}>
              Consultants, resellers and anyone connected to hospitals can join. Earn {DEFAULT_COMMISSION_PCT}% of every referred
              hospital&apos;s subscription, every month, for as long as they stay.
            </p>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>Your name / company *</label>
              <input value={form.name} onChange={set('name')} required className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} placeholder="e.g. Coimbatore Med Consultants" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>Email *</label>
                <input type="email" value={form.email} onChange={set('email')} required className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} placeholder="you@example.com" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>Phone</label>
                <input value={form.phone} onChange={set('phone')} className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} placeholder="+91…" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>Password *</label>
                <input type="password" value={form.password} onChange={set('password')} required className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} placeholder="At least 8 characters" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>Confirm password *</label>
                <input type="password" value={form.confirm} onChange={set('confirm')} required className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} placeholder="Re-enter password" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>How will you refer? (optional)</label>
              <textarea value={form.note} onChange={set('note')} rows={2} className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} placeholder="e.g. I set up new hospitals across Tamil Nadu" />
            </div>
            {error && <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: loading ? '#94A3B8' : TEAL, color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Submitting…' : 'Apply to join'}
            </button>
            <p className="text-xs text-center" style={{ color: '#94A3B8' }}>
              Already a partner? <Link href="/partner/login" className="font-medium underline" style={{ color: TEAL }}>Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  )
}
