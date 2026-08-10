'use client'

import { useState } from 'react'
import BrandMark from '@/components/ui/BrandMark'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { loginPatient, registerPatient, requestPatientPasswordReset } from '@/app/actions/patientPortal'

const TEAL = '#0D9488'
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #E2E8F0',
  fontSize: 15, outline: 'none', color: '#0F172A',
}

type Mode = 'login' | 'register' | 'forgot'

export default function PatientAuth() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', aadhaar: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentReset, setSentReset] = useState(false)

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })); setError(null) }

  async function submit() {
    setBusy(true); setError(null)
    if (mode === 'login') {
      const res = await loginPatient({ email: form.email, password: form.password })
      setBusy(false)
      if (!res.success) { setError(res.error); return }
      router.refresh()
    } else if (mode === 'register') {
      const res = await registerPatient({
        full_name: form.full_name, email: form.email, phone: form.phone,
        password: form.password, aadhaar: form.aadhaar || null,
      })
      setBusy(false)
      if (!res.success) { setError(res.error); return }
      router.refresh()
    } else {
      await requestPatientPasswordReset(form.email)
      setBusy(false)
      setSentReset(true)
    }
  }

  const title = mode === 'login' ? 'Your health, in one place' : mode === 'register' ? 'Create your account' : 'Reset your password'
  const subtitle = mode === 'login'
    ? 'Sign in to see your records, reports and bills across every Uyirly hospital.'
    : mode === 'register'
      ? 'Register once to access your records and book appointments at any Uyirly hospital.'
      : 'Enter your email and we’ll send you a reset link.'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg,#ecfdf5,#f0fdfa 45%,#fff)', padding: '1.5rem' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
          <BrandMark size={40} />
          <span style={{ fontSize: 22, fontWeight: 700, color: '#0F172A' }}>Uyirly</span>
        </div>

        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #E2E8F0', boxShadow: '0 8px 30px rgba(2,6,23,0.06)', padding: '28px 24px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>{title}</h1>
          <p style={{ fontSize: 14, color: '#64748B', marginBottom: 20 }}>{subtitle}</p>

          {mode === 'forgot' && sentReset ? (
            <p style={{ fontSize: 14, color: '#065F46', background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 12, padding: '12px 14px' }}>
              If an account exists for that email, a reset link is on its way. Check your inbox.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {mode === 'register' && (
                <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Full name" style={inputStyle} />
              )}
              {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
                <input value={form.email} onChange={(e) => set('email', e.target.value)} type="email" placeholder="Email address" style={inputStyle}
                  onKeyDown={(e) => e.key === 'Enter' && mode !== 'register' && submit()} />
              )}
              {mode === 'register' && (
                <>
                  <input value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="numeric" placeholder="Mobile number" style={inputStyle} />
                  <input value={form.aadhaar} onChange={(e) => set('aadhaar', e.target.value.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" placeholder="Aadhaar (12 digits)" style={inputStyle} />
                </>
              )}
              {(mode === 'login' || mode === 'register') && (
                <input value={form.password} onChange={(e) => set('password', e.target.value)} type="password" placeholder={mode === 'register' ? 'Create a password (min 8)' : 'Password'} style={inputStyle}
                  onKeyDown={(e) => e.key === 'Enter' && submit()} />
              )}

              <button onClick={submit} disabled={busy}
                style={{ width: '100%', padding: '12px', borderRadius: 12, background: busy ? '#94A3B8' : TEAL, color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
              </button>
            </div>
          )}

          {error && <p style={{ fontSize: 13, color: '#DC2626', marginTop: 12, textAlign: 'center' }}>{error}</p>}

          {/* Mode switches */}
          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: '#64748B' }}>
            {mode === 'login' && (
              <>
                <button onClick={() => { setMode('forgot'); setError(null); setSentReset(false) }} style={linkBtn}>Forgot password?</button>
                <div style={{ marginTop: 8 }}>New patient? <button onClick={() => { setMode('register'); setError(null) }} style={linkBtn}>Create an account</button></div>
              </>
            )}
            {mode === 'register' && (
              <div>Already registered? <button onClick={() => { setMode('login'); setError(null) }} style={linkBtn}>Sign in</button></div>
            )}
            {mode === 'forgot' && (
              <button onClick={() => { setMode('login'); setError(null); setSentReset(false) }} style={linkBtn}>Back to sign in</button>
            )}
          </div>
        </div>

        <p style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', fontSize: 12, color: '#94A3B8', marginTop: 16 }}>
          <ShieldCheck style={{ width: 14, height: 14 }} /> Your data is private to you. One login, all your hospitals.
        </p>
      </div>
    </div>
  )
}

const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: TEAL, fontWeight: 600, cursor: 'pointer', fontSize: 13, padding: 0 }
