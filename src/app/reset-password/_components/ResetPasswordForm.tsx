'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { completePasswordReset } from '@/app/actions/auth'
import { Building2, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'

interface Props { hospitalName?: string | null }

function strengthLabel(pw: string): { label: string; color: string; width: string } {
  if (pw.length === 0) return { label: '', color: '#E2E8F0', width: '0%' }
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { label: 'Weak', color: '#EF4444', width: '20%' }
  if (score <= 2) return { label: 'Fair', color: '#F59E0B', width: '45%' }
  if (score <= 3) return { label: 'Good', color: '#3B82F6', width: '70%' }
  return { label: 'Strong', color: '#10B981', width: '100%' }
}

export default function ResetPasswordForm({ hospitalName }: Props) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  const strength = strengthLabel(password)

  // Supabase delivers the recovery session via the URL hash (implicit) or code (PKCE).
  // We must exchange it before showing the form so updateUser() has a valid session.
  useEffect(() => {
    const supabase = createClient()

    const hash = window.location.hash
    const code = new URLSearchParams(window.location.search).get('code')

    async function exchange() {
      if (hash) {
        const params = new URLSearchParams(hash.slice(1))
        const access_token  = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        const type = params.get('type')
        if (type === 'recovery' && access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token })
          setSessionReady(true)
          return
        }
      }
      if (code) {
        await supabase.auth.exchangeCodeForSession(code)
        setSessionReady(true)
        return
      }
      // Already have a recovery session
      const { data: { session } } = await supabase.auth.getSession()
      if (session) setSessionReady(true)
      else router.replace('/forgot-password')
    }

    exchange()
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      return
    }

    // Audit log + sign out the recovery session
    await completePasswordReset()
    await supabase.auth.signOut()

    setDone(true)
    setTimeout(() => router.replace('/login?reset=1'), 2000)
  }

  if (!sessionReady) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto"
            style={{ borderColor: '#E2E8F0', borderTopColor: '#0D9488' }} />
          <p className="text-sm" style={{ color: '#64748B' }}>Verifying your reset link…</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <Building2 className="w-7 h-7" style={{ color: '#0D9488' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>
            {hospitalName ?? 'Uyirly'}
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#64748B' }}>Set a new password</p>
        </div>

        <div className="glass-card p-8">
          {done ? (
            <div className="text-center space-y-3">
              <CheckCircle className="w-10 h-10 mx-auto" style={{ color: '#10B981' }} />
              <p className="text-sm font-medium" style={{ color: '#0F172A' }}>
                Password updated! Redirecting to sign in…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* New password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
                  New password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm transition-all pr-10"
                    style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', minHeight: '44px' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.1)' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none' }}
                  />
                  <button type="button" onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                    style={{ color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Strength bar */}
                {password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1.5 rounded-full" style={{ background: '#E2E8F0' }}>
                      <div className="h-full rounded-full transition-all duration-300"
                        style={{ width: strength.width, background: strength.color }} />
                    </div>
                    <p className="text-xs" style={{ color: strength.color }}>{strength.label}</p>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
                  Confirm new password
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm transition-all"
                  style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', minHeight: '44px' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.1)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none' }}
                />
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
                {loading ? 'Updating…' : 'Set new password'}
              </button>
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
