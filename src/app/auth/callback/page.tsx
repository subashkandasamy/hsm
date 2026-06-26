'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    async function handleCallback() {
      const supabase = createClient()

      // ── Implicit flow: Supabase magic link appends tokens as URL hash ─────
      // e.g. /auth/callback#access_token=...&refresh_token=...&type=magiclink
      const hash = typeof window !== 'undefined' ? window.location.hash : ''
      if (hash) {
        const params = new URLSearchParams(hash.slice(1))
        const access_token  = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (!error) {
            router.replace('/dashboard?welcome=1')
            return
          }
        }
      }

      // ── PKCE flow: code in query string ──────────────────────────────────
      const code = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          router.replace('/dashboard?welcome=1')
          return
        }
      }

      // ── Existing session (user revisits the page) ─────────────────────────
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace('/dashboard?welcome=1')
        return
      }

      setFailed(true)
      setTimeout(() => router.replace('/login'), 2000)
    }

    handleCallback()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #ECFEFF 50%, #F0FDFA 100%)' }}>
      <div className="text-center space-y-4">
        {!failed ? (
          <>
            <div className="w-12 h-12 border-2 rounded-full animate-spin mx-auto"
              style={{ borderColor: '#E2E8F0', borderTopColor: '#0D9488' }} />
            <p className="text-sm font-medium" style={{ color: '#0F172A' }}>
              Setting up your dashboard…
            </p>
            <p className="text-xs" style={{ color: '#94A3B8' }}>
              Signing you in automatically
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium" style={{ color: '#DC2626' }}>
              Sign-in link expired. Redirecting to login…
            </p>
          </>
        )}
      </div>
    </div>
  )
}
