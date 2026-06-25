'use client'

import { useState, useTransition, useCallback } from 'react'
import { CheckCircle, XCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import { checkSlugAvailable, signupHospital } from '@/app/actions/onboarding'

type SlugState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

const inputStyle = {
  background: 'rgba(255,255,255,0.8)',
  border: '1px solid #E2E8F0',
  color: '#0F172A',
  outline: 'none',
  minHeight: '44px',
} as const

const focusStyle = {
  borderColor: '#0D9488',
  boxShadow: '0 0 0 3px rgba(13,148,136,0.1)',
} as const

export default function SignupForm() {
  const [hospitalName, setHospitalName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugState, setSlugState] = useState<SlugState>('idle')
  const [slugReason, setSlugReason] = useState('')
  const [adminName, setAdminName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [doneSlug, setDoneSlug] = useState('')
  const [isPending, startTransition] = useTransition()
  const [checkTimer, setCheckTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const deriveSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

  const scheduleSlugCheck = useCallback((value: string) => {
    if (checkTimer) clearTimeout(checkTimer)
    if (!value || value.length < 3) { setSlugState('idle'); return }
    setSlugState('checking')
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await checkSlugAvailable(value)
        if (res.available) { setSlugState('available'); setSlugReason('') }
        else { setSlugState(res.reason === 'invalid' ? 'invalid' : 'taken'); setSlugReason(res.reason ?? '') }
      })
    }, 500)
    setCheckTimer(t)
  }, [checkTimer])

  const handleNameChange = (value: string) => {
    setHospitalName(value)
    const derived = deriveSlug(value)
    setSlug(derived)
    scheduleSlugCheck(derived)
  }

  const handleSlugChange = (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40)
    setSlug(cleaned)
    scheduleSlugCheck(cleaned)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const res = await signupHospital({ hospitalName, slug, adminName, adminEmail: email, password })
      if (res.success) { setDone(true); setDoneSlug(res.slug) }
      else setError(res.error)
    })
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: '#0D9488' }} />
        <h2 className="text-lg font-bold mb-2" style={{ color: '#0F172A' }}>Account created!</h2>
        <p className="text-sm mb-6" style={{ color: '#64748B' }}>
          Check your email to confirm your account, then log in at:
        </p>
        <a
          href={`http://${doneSlug}.localhost:3000/login`}
          className="text-sm font-semibold underline underline-offset-2"
          style={{ color: '#0D9488' }}
        >
          {doneSlug}.uyirly.com
        </a>
      </div>
    )
  }

  const slugOk = slugState === 'available'
  const canSubmit = !isPending && slugOk && hospitalName && adminName && email && password.length >= 8

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Hospital name */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
          Hospital / Clinic name
        </label>
        <input
          type="text"
          value={hospitalName}
          onChange={e => handleNameChange(e.target.value)}
          placeholder="City General Hospital"
          required
          className="w-full px-3.5 py-2.5 rounded-xl text-sm transition-all"
          style={inputStyle}
          onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
          onBlur={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none' }}
        />
      </div>

      {/* Slug */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
          Subdomain
        </label>
        <div className="flex items-center rounded-xl overflow-hidden transition-all"
          style={{ border: '1px solid #E2E8F0', background: 'rgba(255,255,255,0.8)' }}>
          <input
            type="text"
            value={slug}
            onChange={e => handleSlugChange(e.target.value)}
            placeholder="city-general"
            required
            className="flex-1 px-3.5 py-2.5 text-sm bg-transparent focus:outline-none"
            style={{ color: '#0F172A', minHeight: '44px' }}
          />
          <span className="px-2 text-xs shrink-0" style={{ color: '#94A3B8' }}>.uyirly.com</span>
          <div className="px-3">
            {slugState === 'checking'  && <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#94A3B8' }} />}
            {slugState === 'available' && <CheckCircle className="w-4 h-4" style={{ color: '#16A34A' }} />}
            {(slugState === 'taken' || slugState === 'invalid') && <XCircle className="w-4 h-4" style={{ color: '#DC2626' }} />}
          </div>
        </div>
        {slugState === 'available' && (
          <p className="mt-1 text-xs" style={{ color: '#16A34A' }}>Available</p>
        )}
        {(slugState === 'taken' || slugState === 'invalid') && (
          <p className="mt-1 text-xs" style={{ color: '#DC2626' }}>{slugReason || 'Not available'}</p>
        )}
      </div>

      {/* Admin name */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
          Your full name
        </label>
        <input
          type="text"
          value={adminName}
          onChange={e => setAdminName(e.target.value)}
          placeholder="Dr. Anitha Kumar"
          required
          className="w-full px-3.5 py-2.5 rounded-xl text-sm transition-all"
          style={inputStyle}
          onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
          onBlur={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none' }}
        />
      </div>

      {/* Email */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
          Work email
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="admin@yourhospital.com"
          required
          className="w-full px-3.5 py-2.5 rounded-xl text-sm transition-all"
          style={inputStyle}
          onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
          onBlur={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none' }}
        />
      </div>

      {/* Password */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
          Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Min. 8 characters"
            required
            minLength={8}
            className="w-full px-3.5 py-2.5 pr-11 rounded-xl text-sm transition-all"
            style={inputStyle}
            onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
            onBlur={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none' }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
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
        disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
        style={{
          background: canSubmit ? '#0D9488' : '#94A3B8',
          color: '#fff',
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          minHeight: '44px',
        }}
        onMouseEnter={e => { if (canSubmit) e.currentTarget.style.background = '#0F766E' }}
        onMouseLeave={e => { if (canSubmit) e.currentTarget.style.background = '#0D9488' }}
      >
        {isPending
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</>
          : 'Create hospital account'
        }
      </button>

      <p className="text-xs text-center" style={{ color: '#94A3B8' }}>
        By signing up you agree to our Terms of Service and Privacy Policy.
      </p>
    </form>
  )
}
