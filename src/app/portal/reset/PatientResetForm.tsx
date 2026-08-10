'use client'

import { useState } from 'react'
import BrandMark from '@/components/ui/BrandMark'
import { useRouter } from 'next/navigation'
import { setPatientPassword } from '@/app/actions/patientPortal'

const TEAL = '#0D9488'
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #E2E8F0',
  fontSize: 15, outline: 'none', color: '#0F172A',
}

export default function PatientResetForm({ token }: { token: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setBusy(true); setError(null)
    const res = await setPatientPassword(token, password)
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    router.replace('/portal')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg,#ecfdf5,#f0fdfa 45%,#fff)', padding: '1.5rem' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
          <BrandMark size={40} />
          <span style={{ fontSize: 22, fontWeight: 700, color: '#0F172A' }}>Uyirly</span>
        </div>
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #E2E8F0', boxShadow: '0 8px 30px rgba(2,6,23,0.06)', padding: '28px 24px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 16 }}>Set a new password</h1>
          {!token ? (
            <p style={{ fontSize: 14, color: '#DC2626' }}>This reset link is invalid. Please request a new one.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input value={password} onChange={(e) => { setPassword(e.target.value); setError(null) }} type="password" placeholder="New password (min 8)" style={inputStyle} />
              <input value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(null) }} type="password" placeholder="Confirm password" style={inputStyle}
                onKeyDown={(e) => e.key === 'Enter' && submit()} />
              <button onClick={submit} disabled={busy}
                style={{ width: '100%', padding: '12px', borderRadius: 12, background: busy ? '#94A3B8' : TEAL, color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? 'Saving…' : 'Set password & continue'}
              </button>
            </div>
          )}
          {error && <p style={{ fontSize: 13, color: '#DC2626', marginTop: 12, textAlign: 'center' }}>{error}</p>}
        </div>
      </div>
    </div>
  )
}
