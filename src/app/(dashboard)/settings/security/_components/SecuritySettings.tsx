'use client'

import { useState, useTransition } from 'react'
import { ShieldCheck, ShieldOff, CheckCircle } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { set2FAEnabled } from '@/app/actions/tenantSettings'

interface Props {
  initialEnabled: boolean
}

export default function SecuritySettings({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    setSaved(false)
    setError('')
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      const res = await set2FAEnabled(next)
      if (!res.success) {
        setEnabled(!next) // revert
        setError(res.error)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    })
  }

  return (
    <div className="max-w-2xl space-y-4">
      <GlassCard className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: enabled ? 'rgba(13,148,136,0.1)' : 'rgba(148,163,184,0.1)', border: `1px solid ${enabled ? 'rgba(13,148,136,0.2)' : '#E2E8F0'}` }}>
            {enabled
              ? <ShieldCheck className="w-5 h-5" style={{ color: '#0D9488' }} />
              : <ShieldOff className="w-5 h-5" style={{ color: '#94A3B8' }} />}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
              SMS Two-Factor Authentication
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
              When enabled, all staff must verify their identity via a 6-digit SMS code after every login.
              Charges apply per SMS sent through your provider.
            </p>

            {/* Status pill */}
            <span
              className="inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full"
              style={enabled
                ? { background: '#CCFBF1', color: '#0D9488' }
                : { background: '#F1F5F9', color: '#94A3B8' }}
            >
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          {/* Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={handleToggle}
            disabled={isPending}
            className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200"
            style={{
              background: enabled ? '#0D9488' : '#CBD5E1',
              border: 'none',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
              style={{ transform: enabled ? 'translateX(20px)' : 'translateX(0)' }}
            />
          </button>
        </div>

        {saved && (
          <div className="flex items-center gap-1.5 mt-4 text-xs font-medium" style={{ color: '#0D9488' }}>
            <CheckCircle className="w-3.5 h-3.5" />
            {enabled ? 'SMS 2FA enabled — staff will be prompted on next login.' : 'SMS 2FA disabled — staff bypass OTP on login.'}
          </div>
        )}

        {error && (
          <p className="mt-4 text-xs" style={{ color: '#DC2626' }}>{error}</p>
        )}
      </GlassCard>

      <div className="rounded-xl px-4 py-3 text-xs" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
        <strong>Note:</strong> Disabling 2FA means staff log in with email + password only.
        Re-enable it at any time — changes take effect on the next login.
      </div>
    </div>
  )
}
