'use client'

import { useState, useEffect, useTransition } from 'react'
import { Building2, ArrowRight, Loader2, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react'
import { checkTenantExists } from '@/app/actions/tenantLookup'

// @capacitor/preferences — loaded dynamically so the web bundle is unaffected
async function getPreferences() {
  const { Preferences } = await import('@capacitor/preferences')
  return Preferences
}

const PREF_KEY = 'uyirly_hospital_slug'

function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\.uyirly\.com.*$/, '')
    .replace(/[^a-z0-9-]/g, '')
}

interface Props {
  forcePick?: boolean  // true when "Use a different hospital" clears the saved slug
}

export default function HospitalEntryForm({ forcePick = false }: Props) {
  const [step, setStep] = useState<'loading' | 'pick' | 'confirmed'>('loading')
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [confirmedName, setConfirmedName] = useState('')
  const [confirmedSlug, setConfirmedSlug] = useState('')
  const [isPending, startTransition] = useTransition()

  // On mount: check saved slug (unless forced to re-pick)
  useEffect(() => {
    if (forcePick) { setStep('pick'); return }

    getPreferences().then(async (Preferences) => {
      const { value } = await Preferences.get({ key: PREF_KEY })
      if (value) {
        // Saved slug found — go straight to the tenant login
        window.location.href = `https://${value}.uyirly.com/login`
      } else {
        setStep('pick')
      }
    }).catch(() => setStep('pick'))
  }, [forcePick])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const slug = normalizeSlug(input)
    if (!slug || slug.length < 2) {
      setError('Enter your hospital\'s address (e.g. city-hospital)')
      return
    }
    setError('')
    startTransition(async () => {
      const result = await checkTenantExists(slug)
      if (!result.found) {
        setError('Hospital not found. Check the address and try again.')
        return
      }
      setConfirmedName(result.name)
      setConfirmedSlug(slug)
      setStep('confirmed')
    })
  }

  async function handleConfirm() {
    const Preferences = await getPreferences()
    await Preferences.set({ key: PREF_KEY, value: confirmedSlug })
    window.location.href = `https://${confirmedSlug}.uyirly.com/login`
  }

  function handleBack() {
    setStep('pick')
    setConfirmedName('')
    setConfirmedSlug('')
  }

  // ── Loading splash ───────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: '#F8FAFC' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#0D9488' }} />
      </div>
    )
  }

  // ── Confirmed — show hospital name, ask to proceed ───────────────────────────
  if (step === 'confirmed') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg,#F8FAFC 0%,#ECFEFF 50%,#F0FDFA 100%)' }}>
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: '#CCFBF1', border: '1px solid rgba(13,148,136,0.25)' }}>
              <CheckCircle className="w-8 h-8" style={{ color: '#0D9488' }} />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Found it!</h1>
            <p className="mt-1 text-sm" style={{ color: '#64748B' }}>Hospital confirmed</p>
          </div>

          <div className="rounded-2xl p-6 mb-4 text-center"
            style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', backdropFilter: 'blur(12px)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>
              You are signing in to
            </p>
            <p className="text-xl font-bold" style={{ color: '#0F172A' }}>{confirmedName}</p>
            <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>{confirmedSlug}.uyirly.com</p>
          </div>

          <button
            onClick={handleConfirm}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer', minHeight: '52px' }}
          >
            Continue to login <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={handleBack}
            className="w-full mt-3 text-sm text-center py-2"
            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
          >
            That's not my hospital
          </button>
        </div>
      </div>
    )
  }

  // ── Pick hospital ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg,#F8FAFC 0%,#ECFEFF 50%,#F0FDFA 100%)' }}>
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <Building2 className="w-8 h-8" style={{ color: '#0D9488' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Welcome to Uyirly</h1>
          <p className="mt-2 text-sm max-w-xs" style={{ color: '#64748B' }}>
            Enter your hospital's address to get started.
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl p-6"
          style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', backdropFilter: 'blur(12px)' }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#0F172A' }}>
                Hospital address
              </label>
              {/* Input with .uyirly.com suffix label */}
              <div className="flex items-stretch rounded-xl overflow-hidden"
                style={{ border: `1px solid ${error ? '#FCA5A5' : '#E2E8F0'}`, background: 'rgba(255,255,255,0.9)', minHeight: '48px' }}>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => { setInput(e.target.value); setError('') }}
                  placeholder="city-hospital"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="flex-1 px-4 py-3 text-sm bg-transparent focus:outline-none"
                  style={{ color: '#0F172A' }}
                  disabled={isPending}
                />
                <span className="flex items-center pr-4 text-xs shrink-0 select-none" style={{ color: '#94A3B8' }}>
                  .uyirly.com
                </span>
              </div>
              {error && (
                <div className="flex items-start gap-1.5 mt-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#DC2626' }} />
                  <p className="text-xs" style={{ color: '#DC2626' }}>{error}</p>
                </div>
              )}
              <p className="mt-2 text-xs" style={{ color: '#94A3B8' }}>
                Your admin shared this address when setting up Uyirly.
              </p>
            </div>

            <button
              type="submit"
              disabled={isPending || !input.trim()}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: isPending || !input.trim() ? '#94A3B8' : '#0D9488',
                color: '#fff',
                border: 'none',
                cursor: isPending || !input.trim() ? 'not-allowed' : 'pointer',
                minHeight: '52px',
              }}
            >
              {isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</>
                : <>Find my hospital <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        </div>

        <p className="text-center mt-8 text-xs" style={{ color: '#94A3B8' }}>
          Powered by <span style={{ color: '#0D9488' }}>Uyirly</span>
        </p>
      </div>
    </div>
  )
}
