'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LoginSchema } from '@/lib/schemas'
import { Building2, Eye, EyeOff, LogIn } from 'lucide-react'

interface Props { hospitalName?: string | null }

export default function LoginForm({ hospitalName }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const result = LoginSchema.safeParse({ email, password })
    if (!result.success) {
      setError(result.error.issues[0].message)
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <Building2 className="w-7 h-7" style={{ color: '#0D9488' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>
            {hospitalName ?? 'Uyirly'}
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#64748B' }}>Sign in to your account</p>
        </div>

        {/* Login card */}
        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@hospital.com"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm transition-all"
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

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm transition-all pr-10"
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
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: '#94A3B8' }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl px-3.5 py-2.5 text-sm"
                style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: loading ? '#94A3B8' : '#0D9488',
                color: '#ffffff',
                cursor: loading ? 'not-allowed' : 'pointer',
                border: 'none',
                minHeight: '44px',
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#0F766E' }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#0D9488' }}
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: '#94A3B8' }}>
          {hospitalName ? `${hospitalName} — powered by ` : ''}<span style={{ color: '#0D9488' }}>Uyirly</span>
          {' '}&copy; {new Date().getFullYear()}
        </p>
      </div>
    </main>
  )
}
