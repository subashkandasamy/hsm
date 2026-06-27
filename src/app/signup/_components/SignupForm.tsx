'use client'

import { useState, useTransition, useCallback } from 'react'
import { CheckCircle, XCircle, Loader2, Eye, EyeOff, Check } from 'lucide-react'
import { checkSlugAvailable, signupHospital } from '@/app/actions/onboarding'

type SlugState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

const DEPT_OPTIONS = [
  { value: 'General Medicine', label: 'General Medicine' },
  { value: 'Dental',           label: 'Dental' },
  { value: 'Eye Care',         label: 'Eye Care (Ophthalmology)' },
  { value: 'Paediatrics',      label: 'Paediatrics' },
  { value: 'Gynaecology',      label: 'Gynaecology' },
  { value: 'Orthopaedics',     label: 'Orthopaedics' },
  { value: 'Surgery',          label: 'Surgery' },
  { value: 'ENT',              label: 'ENT' },
]

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

interface Props {
  plan?: 'starter' | 'growth'
}

export default function SignupForm({ plan = 'starter' }: Props) {
  const [hospitalName, setHospitalName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugState, setSlugState] = useState<SlugState>('idle')
  const [slugReason, setSlugReason] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminPhone, setAdminPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedDepts, setSelectedDepts] = useState<string[]>(['General Medicine'])
  const [error, setError] = useState('')
  const [redirecting, setRedirecting] = useState(false)
  const [fallbackSlug, setFallbackSlug] = useState('')
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
      const depts = selectedDepts.length > 0 ? selectedDepts : undefined
      const res = await signupHospital({ hospitalName, slug, adminName, adminPhone: `+91${adminPhone}`, adminEmail: email, password, plan, departments: depts })
      if (!res.success) {
        setError(res.error)
        return
      }
      if (res.loginUrl) {
        // Redirect to magic link — Supabase verifies and bounces to {slug}.uyirly.com/auth/callback
        setRedirecting(true)
        window.location.href = res.loginUrl
      } else {
        // Fallback: show subdomain link if magic link generation failed
        setFallbackSlug(res.slug)
      }
    })
  }

  // Fallback success screen (magic link unavailable)
  if (fallbackSlug) {
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'
    return (
      <div className="text-center py-4">
        <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: '#0D9488' }} />
        <h2 className="text-lg font-bold mb-2" style={{ color: '#0F172A' }}>Account created!</h2>
        <p className="text-sm mb-6" style={{ color: '#64748B' }}>
          Log in to your hospital dashboard at:
        </p>
        <a
          href={`https://${fallbackSlug}.${rootDomain}/login`}
          className="text-sm font-semibold underline underline-offset-2"
          style={{ color: '#0D9488' }}
        >
          {fallbackSlug}.{rootDomain}
        </a>
      </div>
    )
  }

  // Redirecting screen
  if (redirecting) {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto"
          style={{ borderColor: '#E2E8F0', borderTopColor: '#0D9488' }} />
        <p className="text-sm font-medium" style={{ color: '#0F172A' }}>Setting up your dashboard…</p>
        <p className="text-xs" style={{ color: '#94A3B8' }}>You'll be signed in automatically.</p>
      </div>
    )
  }

  const slugOk = slugState === 'available'
  const phoneValid = /^\d{10}$/.test(adminPhone)
  const canSubmit = !isPending && slugOk && hospitalName && adminName && phoneValid && !phoneError && email && password.length >= 8

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

      {/* Admin phone */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
          Mobile number
        </label>
        <div className="flex items-stretch rounded-xl overflow-hidden transition-all"
          style={{ border: `1px solid ${phoneError ? '#DC2626' : '#E2E8F0'}`, background: 'rgba(255,255,255,0.8)', minHeight: '44px' }}>
          <span className="px-3 flex items-center text-sm font-medium select-none shrink-0"
            style={{ background: 'rgba(13,148,136,0.06)', borderRight: '1px solid #E2E8F0', color: '#0F172A' }}>
            +91
          </span>
          <input
            type="tel"
            inputMode="numeric"
            value={adminPhone}
            onChange={e => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
              setAdminPhone(digits)
              if (phoneError && digits.length === 10) setPhoneError('')
            }}
            onBlur={() => {
              if (adminPhone && adminPhone.length !== 10) setPhoneError('Enter exactly 10 digits')
              else setPhoneError('')
            }}
            placeholder="9876543210"
            required
            maxLength={10}
            className="flex-1 px-3 py-2.5 text-sm bg-transparent focus:outline-none"
            style={{ color: '#0F172A' }}
          />
        </div>
        {phoneError && (
          <p className="mt-1 text-xs" style={{ color: '#DC2626' }}>{phoneError}</p>
        )}
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

      {/* Department selection */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
          Starting Departments
        </label>
        <p className="text-xs mb-2" style={{ color: '#94A3B8' }}>
          Choose which departments to set up. You can add more in Settings later.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {DEPT_OPTIONS.map(({ value, label }) => {
            const selected = selectedDepts.includes(value)
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setSelectedDepts((prev) =>
                    selected ? prev.filter((d) => d !== value) : [...prev, value]
                  )
                }}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-medium transition-all"
                style={{
                  background: selected ? 'rgba(13,148,136,0.08)' : 'rgba(255,255,255,0.8)',
                  border: `1px solid ${selected ? '#0D9488' : '#E2E8F0'}`,
                  color: selected ? '#0D9488' : '#475569',
                  cursor: 'pointer', minHeight: '44px',
                }}
              >
                <div className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                  style={{ background: selected ? '#0D9488' : '#E2E8F0' }}>
                  {selected && <Check className="w-2.5 h-2.5" style={{ color: '#fff' }} />}
                </div>
                {label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => setSelectedDepts([])}
          className="mt-2 text-xs underline"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
        >
          I'll set this up myself
        </button>
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
          : `Start free trial${plan === 'growth' ? ' — Growth' : ''}`
        }
      </button>

      <p className="text-xs text-center" style={{ color: '#94A3B8' }}>
        14-day free trial. No credit card required.
      </p>
    </form>
  )
}
