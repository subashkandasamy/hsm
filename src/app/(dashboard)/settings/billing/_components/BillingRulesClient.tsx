'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { updatePrepayRules } from '@/app/actions/billingSettings'
import type { PayGateService, PrepayRules } from '@/lib/payGate'

interface Props {
  initialRules: PrepayRules
  /** false when the settings could not be read — the database update for this page is not applied yet. */
  readable: boolean
}

/**
 * Each switch says what will actually happen in both positions, so the choice
 * is made knowing its consequence — the same approach as the GST registration
 * options on the hospital profile.
 */
const SERVICES: { key: PayGateService; label: string; on: string; off: string }[] = [
  {
    key: 'consultation', label: 'Consultation',
    on:  'The patient pays at the counter before the doctor sees them.',
    off: 'The patient sees the doctor first. The fee is still billed at booking and collected afterwards from Billing.',
  },
  {
    key: 'lab', label: 'Lab tests',
    on:  'The sample is collected, and the report released, only after payment.',
    off: 'The sample is collected and the report released before payment. Collect it from Billing.',
  },
  {
    key: 'radiology', label: 'Radiology',
    on:  'The scan is performed only after payment.',
    off: 'The scan is performed before payment. Collect it from Billing.',
  },
  {
    key: 'pharmacy', label: 'Medicines',
    on:  'Medicines are handed over — dispatched or sold at the counter — only after payment.',
    off: 'Medicines are handed over before payment. Collect it from Billing.',
  },
  {
    key: 'blood', label: 'Blood',
    on:  'Blood is issued only after payment. An emergency request is always issued.',
    off: 'Blood is issued before payment. Collect it from Billing.',
  },
]

export default function BillingRulesClient({ initialRules, readable }: Props) {
  const [rules, setRules] = useState<PrepayRules>(initialRules)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  function toggle(key: PayGateService) {
    const previous = rules
    const next = { ...rules, [key]: !rules[key] }
    setRules(next)
    setError('')
    setSaved(false)
    startTransition(async () => {
      const res = await updatePrepayRules({ [key]: next[key] })
      if (!res.success) {
        setRules(previous)        // the switch must not show a setting that was not saved
        setError(res.error)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {!readable && (
        <div className="p-4 rounded-xl text-sm" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
          These settings cannot be loaded yet — a database update for this page still needs to be applied.
          Until then every service is paid for first, exactly as before.
        </div>
      )}

      <GlassCard>
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-1">
            <h2 className="font-semibold" style={{ color: '#0F172A' }}>Payment before service</h2>
            {saved && (
              <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#059669' }}>
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
          </div>
          <p className="text-sm mb-5" style={{ color: '#64748B' }}>
            On, the service waits until its bill is paid. Off, the service goes ahead and the bill is collected
            later — it is still raised either way.
          </p>

          <div className="space-y-4">
            {SERVICES.map(({ key, label, on, off }) => (
              <div key={key} className="flex items-start gap-4">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  disabled={isPending || !readable}
                  role="switch"
                  aria-checked={rules[key]}
                  aria-label={`${label}: payment before service`}
                  className="mt-0.5 flex-shrink-0 w-10 h-6 rounded-full transition-colors relative"
                  style={{ background: rules[key] ? '#0D9488' : '#CBD5E1', opacity: readable ? 1 : 0.5 }}
                >
                  <span
                    className="block w-4 h-4 rounded-full bg-white shadow transition-transform absolute top-1"
                    style={{ transform: rules[key] ? 'translateX(20px)' : 'translateX(4px)' }}
                  />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: '#0F172A' }}>
                    {label} <span className="font-normal" style={{ color: '#94A3B8' }}>— {rules[key] ? 'pay first' : 'pay later'}</span>
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{rules[key] ? on : off}</p>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <p className="mt-4 text-sm px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</p>
          )}

          <div className="mt-6 pt-4 text-xs space-y-1" style={{ borderTop: '1px solid #F1F5F9', color: '#94A3B8' }}>
            <p>Cashless (insurance-approved) patients are never asked to pay first, whatever is set here.</p>
            <p>Admitted patients are never held for payment — their charges settle at discharge.</p>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}
