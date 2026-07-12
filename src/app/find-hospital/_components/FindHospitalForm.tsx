'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { findHospitalLoginUrl } from '@/app/actions/onboarding'

export default function FindHospitalForm() {
  const [slug, setSlug] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const cleaned = slug.trim()
    if (cleaned.length < 3) { setError('Enter your hospital’s web address.'); return }

    startTransition(async () => {
      const res = await findHospitalLoginUrl(cleaned)
      if (res.found) {
        window.location.href = res.loginUrl
      } else {
        setError('We couldn’t find a hospital with that address. Check the spelling or contact your administrator.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#0F172A' }}>
          Hospital web address
        </label>
        <div className="flex items-center rounded-xl overflow-hidden transition-all"
          style={{ border: '1px solid #E2E8F0', background: 'rgba(255,255,255,0.8)' }}>
          <input
            type="text"
            value={slug}
            onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 63))}
            placeholder="city-general"
            autoFocus
            className="flex-1 px-3.5 py-2.5 text-sm bg-transparent focus:outline-none"
            style={{ color: '#0F172A', minHeight: '44px' }}
          />
          <span className="px-3 text-xs shrink-0" style={{ color: '#94A3B8' }}>.uyirly.com</span>
        </div>
        <p className="mt-1.5 text-xs" style={{ color: '#94A3B8' }}>
          This was included in your welcome email when you registered.
        </p>
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
        disabled={isPending || slug.trim().length < 3}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
        style={{
          background: isPending || slug.trim().length < 3 ? '#94A3B8' : '#0D9488',
          color: '#fff',
          cursor: isPending || slug.trim().length < 3 ? 'not-allowed' : 'pointer',
          minHeight: '44px',
        }}
      >
        {isPending
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Finding…</>
          : <>Continue to sign in <ArrowRight className="w-4 h-4" /></>}
      </button>

      <p className="text-center text-xs" style={{ color: '#94A3B8' }}>
        Don’t have an account yet?{' '}
        <Link href="/signup" className="font-medium underline" style={{ color: '#0D9488' }}>
          Register your hospital
        </Link>
      </p>
    </form>
  )
}
