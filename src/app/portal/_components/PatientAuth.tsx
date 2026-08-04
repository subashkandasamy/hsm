'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, ArrowRight, ShieldCheck } from 'lucide-react'
import { requestPatientOtp, verifyPatientOtp } from '@/app/actions/patientPortal'

const TEAL = '#0D9488'

export default function PatientAuth() {
  const router = useRouter()
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendCode() {
    if (phone.replace(/\D/g, '').length < 10) { setError('Enter a valid 10-digit mobile number'); return }
    setBusy(true); setError(null)
    const res = await requestPatientOtp(phone)
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    setDevCode(res.devCode ?? null)
    setStep('otp')
  }

  async function verify() {
    if (otp.length < 6) { setError('Enter the 6-digit code'); return }
    setBusy(true); setError(null)
    const res = await verifyPatientOtp(phone, otp)
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg,#ecfdf5,#f0fdfa 45%,#fff)', padding: '1.5rem' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: TEAL, fontSize: '24px', fontWeight: 800, lineHeight: 1 }}>U</span>
          </div>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#0F172A' }}>Uyirly</span>
        </div>

        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #E2E8F0', boxShadow: '0 8px 30px rgba(2,6,23,0.06)', padding: '28px 24px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
            {step === 'phone' ? 'Your health, in one place' : 'Enter the code'}
          </h1>
          <p style={{ fontSize: 14, color: '#64748B', marginBottom: 20 }}>
            {step === 'phone'
              ? 'Log in with your mobile number to see your records, reports and bills across every Uyirly hospital.'
              : `We sent a 6-digit code to +${phone.replace(/\D/g, '')}.`}
          </p>

          {step === 'phone' ? (
            <>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Mobile number</label>
              <div style={{ position: 'relative', marginBottom: 16 }}>
                <Phone style={{ width: 16, height: 16, color: '#94A3B8', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" placeholder="98765 43210"
                  onKeyDown={(e) => e.key === 'Enter' && sendCode()}
                  style={{ width: '100%', padding: '12px 12px 12px 36px', borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 15, outline: 'none', color: '#0F172A' }} />
              </div>
              <button onClick={sendCode} disabled={busy}
                style={{ width: '100%', padding: '12px', borderRadius: 12, background: busy ? '#94A3B8' : TEAL, color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {busy ? 'Sending…' : <>Send code <ArrowRight style={{ width: 16, height: 16 }} /></>}
              </button>
            </>
          ) : (
            <>
              <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="••••••" autoFocus
                onKeyDown={(e) => e.key === 'Enter' && verify()}
                style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 22, letterSpacing: 8, textAlign: 'center', outline: 'none', color: '#0F172A', marginBottom: 12 }} />
              {devCode && (
                <p style={{ fontSize: 12, color: '#B45309', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '6px 10px', marginBottom: 12, textAlign: 'center' }}>
                  Dev mode (WhatsApp not live): your code is <strong>{devCode}</strong>
                </p>
              )}
              <button onClick={verify} disabled={busy}
                style={{ width: '100%', padding: '12px', borderRadius: 12, background: busy ? '#94A3B8' : TEAL, color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? 'Verifying…' : 'Verify & continue'}
              </button>
              <button onClick={() => { setStep('phone'); setOtp(''); setError(null) }}
                style={{ width: '100%', padding: '10px', marginTop: 8, background: 'none', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer' }}>
                Change number
              </button>
            </>
          )}

          {error && <p style={{ fontSize: 13, color: '#DC2626', marginTop: 12, textAlign: 'center' }}>{error}</p>}
        </div>

        <p style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', fontSize: 12, color: '#94A3B8', marginTop: 16 }}>
          <ShieldCheck style={{ width: 14, height: 14 }} /> Your data is private to you. One login, all your hospitals.
        </p>
      </div>
    </div>
  )
}
