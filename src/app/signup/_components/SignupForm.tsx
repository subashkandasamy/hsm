'use client'

import { useState, useTransition, useCallback } from 'react'
import Link from 'next/link'
import { CheckCircle, XCircle, Loader2, Eye, EyeOff, Check, AlertCircle } from 'lucide-react'
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

const inputBase = {
  background: 'rgba(255,255,255,0.8)',
  color: '#0F172A',
  outline: 'none',
  minHeight: '44px',
} as const

const focusStyle = {
  borderColor: '#0D9488',
  boxShadow: '0 0 0 3px rgba(13,148,136,0.1)',
} as const

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FieldKey = 'hospitalName' | 'slug' | 'adminName' | 'phone' | 'email' | 'password' | 'agreed'
type FieldErrors = Partial<Record<FieldKey, string>>

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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedDepts, setSelectedDepts] = useState<string[]>(['General Medicine'])
  const [agreed, setAgreed] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [redirecting, setRedirecting] = useState(false)
  const [fallbackSlug, setFallbackSlug] = useState('')
  const [isPending, startTransition] = useTransition()
  const [checkTimer, setCheckTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const clearFieldError = (k: FieldKey) =>
    setFieldErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev))

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
    clearFieldError('hospitalName')
    const derived = deriveSlug(value)
    setSlug(derived)
    clearFieldError('slug')
    scheduleSlugCheck(derived)
  }

  const handleSlugChange = (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40)
    setSlug(cleaned)
    clearFieldError('slug')
    scheduleSlugCheck(cleaned)
  }

  // Validate every field and return a map of messages. Used on submit so the
  // user is told exactly what to fix (rather than a silently disabled button).
  const validate = (): FieldErrors => {
    const e: FieldErrors = {}
    if (!hospitalName.trim()) e.hospitalName = 'Enter your hospital or clinic name'
    if (!slug.trim()) e.slug = 'Choose your login web address'
    else if (slugState === 'checking') e.slug = 'Still checking this address — one moment'
    else if (slugState !== 'available') e.slug = slugReason || 'This address isn’t available — try another'
    if (!adminName.trim()) e.adminName = 'Enter your full name'
    if (!/^\d{10}$/.test(adminPhone)) e.phone = 'Enter a 10-digit mobile number'
    if (!email.trim()) e.email = 'Enter your work email'
    else if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email address'
    if (password.length < 8) e.password = 'Use at least 8 characters'
    if (!agreed) e.agreed = 'Please accept the Terms and Privacy Policy to continue'
    return e
  }

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault()
    setError('')
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      setError('Please check the highlighted fields below.')
      // Focus the first field with an error
      const order: FieldKey[] = ['hospitalName', 'slug', 'adminName', 'phone', 'email', 'password', 'agreed']
      const first = order.find((k) => errs[k])
      if (first) document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setFieldErrors({})
    startTransition(async () => {
      const depts = selectedDepts.length > 0 ? selectedDepts : undefined
      const res = await signupHospital({ hospitalName, slug, adminName, adminPhone: `+91${adminPhone}`, adminEmail: email, password, plan, departments: depts, acceptedTerms: agreed })
      if (!res.success) {
        setError(res.error)
        return
      }
      if (res.loginUrl) {
        setRedirecting(true)
        window.location.href = res.loginUrl
      } else {
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
        <h2 className="text-lg font-bold mb-2" style={{ color: '#0F172A' }}>Your hospital is ready!</h2>
        <p className="text-sm mb-6" style={{ color: '#64748B' }}>
          This is your private login address — bookmark it. You and your staff will sign in here every day:
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
        <p className="text-sm font-medium" style={{ color: '#0F172A' }}>Setting up your hospital dashboard…</p>
        <p className="text-xs" style={{ color: '#94A3B8' }}>You&apos;ll be signed in automatically in a moment.</p>
      </div>
    )
  }

  // Per-field border colour: red if that field has an error.
  const borderFor = (k: FieldKey) => (fieldErrors[k] ? '#DC2626' : '#E2E8F0')
  const ErrorText = ({ k }: { k: FieldKey }) =>
    fieldErrors[k] ? (
      <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: '#DC2626' }}>
        <AlertCircle className="w-3 h-3 flex-shrink-0" /> {fieldErrors[k]}
      </p>
    ) : null

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Hospital name */}
      <div id="field-hospitalName">
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
          Hospital / clinic name
        </label>
        <input
          type="text"
          value={hospitalName}
          onChange={e => handleNameChange(e.target.value)}
          placeholder="City General Hospital"
          className="w-full px-3.5 py-2.5 rounded-xl text-sm transition-all border"
          style={{ ...inputBase, borderColor: borderFor('hospitalName') }}
          onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
          onBlur={e => { e.currentTarget.style.borderColor = borderFor('hospitalName'); e.currentTarget.style.boxShadow = 'none' }}
        />
        <ErrorText k="hospitalName" />
      </div>

      {/* Login web address (was "Subdomain") */}
      <div id="field-slug">
        <label className="block text-sm font-medium mb-1" style={{ color: '#0F172A' }}>
          Your hospital&apos;s login address
        </label>
        <p className="text-xs mb-1.5" style={{ color: '#64748B' }}>
          This is the private web link where you and your staff will sign in every day. Pick something
          short — usually your hospital&apos;s name.
        </p>
        <div className="flex items-center rounded-xl overflow-hidden transition-all"
          style={{ border: `1px solid ${borderFor('slug')}`, background: 'rgba(255,255,255,0.8)' }}>
          <input
            type="text"
            value={slug}
            onChange={e => handleSlugChange(e.target.value)}
            placeholder="city-general"
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
        {/* Live preview so non-technical users see exactly what they get */}
        {slug && slugState === 'available' && (
          <p className="mt-1.5 text-xs" style={{ color: '#16A34A' }}>
            ✓ Available — you&apos;ll log in at <strong>{slug}.uyirly.com</strong>
          </p>
        )}
        {(slugState === 'taken' || slugState === 'invalid') && !fieldErrors.slug && (
          <p className="mt-1 text-xs" style={{ color: '#DC2626' }}>{slugReason || 'Not available — try another'}</p>
        )}
        <ErrorText k="slug" />
      </div>

      {/* Admin name */}
      <div id="field-adminName">
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
          Your full name
        </label>
        <input
          type="text"
          value={adminName}
          onChange={e => { setAdminName(e.target.value); clearFieldError('adminName') }}
          placeholder="Dr. Anitha Kumar"
          className="w-full px-3.5 py-2.5 rounded-xl text-sm transition-all border"
          style={{ ...inputBase, borderColor: borderFor('adminName') }}
          onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
          onBlur={e => { e.currentTarget.style.borderColor = borderFor('adminName'); e.currentTarget.style.boxShadow = 'none' }}
        />
        <ErrorText k="adminName" />
      </div>

      {/* Admin phone */}
      <div id="field-phone">
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
          Mobile number
        </label>
        <div className="flex items-stretch rounded-xl overflow-hidden transition-all"
          style={{ border: `1px solid ${borderFor('phone')}`, background: 'rgba(255,255,255,0.8)', minHeight: '44px' }}>
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
              if (digits.length === 10) clearFieldError('phone')
            }}
            onBlur={() => { if (adminPhone && adminPhone.length !== 10) setFieldErrors((p) => ({ ...p, phone: 'Enter a 10-digit mobile number' })) }}
            placeholder="9876543210"
            maxLength={10}
            className="flex-1 px-3 py-2.5 text-sm bg-transparent focus:outline-none"
            style={{ color: '#0F172A' }}
          />
        </div>
        <ErrorText k="phone" />
      </div>

      {/* Email */}
      <div id="field-email">
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
          Work email
        </label>
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); clearFieldError('email') }}
          placeholder="admin@yourhospital.com"
          className="w-full px-3.5 py-2.5 rounded-xl text-sm transition-all border"
          style={{ ...inputBase, borderColor: borderFor('email') }}
          onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
          onBlur={e => { e.currentTarget.style.borderColor = borderFor('email'); e.currentTarget.style.boxShadow = 'none' }}
        />
        <ErrorText k="email" />
      </div>

      {/* Password */}
      <div id="field-password">
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
          Create a password
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => { setPassword(e.target.value); if (e.target.value.length >= 8) clearFieldError('password') }}
            placeholder="At least 8 characters"
            className="w-full px-3.5 py-2.5 pr-11 rounded-xl text-sm transition-all border"
            style={{ ...inputBase, borderColor: borderFor('password') }}
            onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
            onBlur={e => { e.currentTarget.style.borderColor = borderFor('password'); e.currentTarget.style.boxShadow = 'none' }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: '#94A3B8' }}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <ErrorText k="password" />
      </div>

      {/* Department selection */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
          Starting departments <span className="font-normal" style={{ color: '#94A3B8' }}>(optional)</span>
        </label>
        <p className="text-xs mb-2" style={{ color: '#94A3B8' }}>
          We&apos;ll set these up for you so you can start right away. You can add or remove departments
          anytime in Settings.
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
          I&apos;ll set this up myself
        </button>
      </div>

      {/* Agreement */}
      <div id="field-agreed">
        <button
          type="button"
          onClick={() => { setAgreed(v => !v); clearFieldError('agreed') }}
          className="flex items-start gap-2.5 text-left w-full"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center mt-0.5 transition-all"
            style={{
              background: agreed ? '#0D9488' : 'rgba(255,255,255,0.8)',
              border: `1px solid ${agreed ? '#0D9488' : (fieldErrors.agreed ? '#DC2626' : '#CBD5E1')}`,
            }}>
            {agreed && <Check className="w-3 h-3" style={{ color: '#fff' }} />}
          </div>
          <span className="text-xs leading-relaxed" style={{ color: '#475569' }}>
            I have read and agree, on behalf of my organisation, to Uyirly&apos;s{' '}
            <Link href="/terms" target="_blank" className="font-medium underline" style={{ color: '#0D9488' }}>
              Terms of Service
            </Link>{' '}and{' '}
            <Link href="/privacy" target="_blank" className="font-medium underline" style={{ color: '#0D9488' }}>
              Privacy Policy
            </Link>
            , and I am authorised to accept them.
          </span>
        </button>
        <ErrorText k="agreed" />
      </div>

      {error && (
        <div className="rounded-xl px-3.5 py-2.5 text-sm flex items-start gap-2"
          style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all"
        style={{
          background: isPending ? '#94A3B8' : '#0D9488',
          color: '#fff',
          cursor: isPending ? 'not-allowed' : 'pointer',
          minHeight: '48px',
        }}
        onMouseEnter={e => { if (!isPending) e.currentTarget.style.background = '#0F766E' }}
        onMouseLeave={e => { if (!isPending) e.currentTarget.style.background = '#0D9488' }}
      >
        {isPending
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating your hospital…</>
          : `Create my hospital & start free trial${plan === 'growth' ? ' — Growth' : ''}`
        }
      </button>

      <p className="text-xs text-center" style={{ color: '#94A3B8' }}>
        30-day free trial · No credit card required · Cancel anytime
      </p>
    </form>
  )
}
