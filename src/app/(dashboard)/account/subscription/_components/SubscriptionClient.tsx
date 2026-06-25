'use client'

import { useState, useTransition } from 'react'
import { CreditCard, CheckCircle, Loader2, ExternalLink, AlertTriangle } from 'lucide-react'
import { createCheckoutSession, createBillingPortalSession } from '@/app/actions/subscription'
import { PLANS } from '@/lib/stripe'
import type { PlanKey } from '@/lib/stripe'
import type { Subscription, Tenant } from '@/lib/types'

interface Props {
  subscription: Subscription | null
  tenant: Tenant | null
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: 'Active',    color: '#34D399', bg: 'rgba(16,185,129,0.12)' },
  trial:     { label: 'Trial',     color: '#A78BFA', bg: 'rgba(139,92,246,0.12)' },
  past_due:  { label: 'Past due',  color: '#FCD34D', bg: 'rgba(245,158,11,0.12)' },
  suspended: { label: 'Suspended', color: '#F87171', bg: 'rgba(239,68,68,0.12)'  },
  cancelled: { label: 'Cancelled', color: '#94A3B8', bg: 'rgba(100,116,139,0.12)'},
}

export default function SubscriptionClient({ subscription, tenant }: Props) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null)

  const handleSubscribe = (plan: PlanKey) => {
    setError('')
    setPendingPlan(plan)
    startTransition(async () => {
      const res = await createCheckoutSession(plan)
      if (res.success) {
        window.location.href = res.url
      } else {
        setError(res.error)
        setPendingPlan(null)
      }
    })
  }

  const handleManageBilling = () => {
    setError('')
    startTransition(async () => {
      const res = await createBillingPortalSession()
      if (res.success) {
        window.location.href = res.url
      } else {
        setError(res.error)
      }
    })
  }

  const currentPlan = subscription?.plan ?? tenant?.plan ?? 'starter'
  const status = tenant?.status ?? 'trial'
  const statusMeta = STATUS_LABEL[status] ?? STATUS_LABEL.trial

  return (
    <div className="space-y-6">
      {/* Current status */}
      <div className="rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs mb-1" style={{ color: '#64748B' }}>Current plan</p>
            <p className="text-lg font-bold capitalize" style={{ color: '#F8FAFC' }}>
              {PLANS[currentPlan as PlanKey]?.name ?? 'Starter'}
            </p>
            {subscription?.current_period_end && (
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                Renews {new Date(subscription.current_period_end).toLocaleDateString()}
              </p>
            )}
          </div>
          <span className="px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: statusMeta.bg, color: statusMeta.color }}>
            {statusMeta.label}
          </span>
        </div>

        {status === 'past_due' && (
          <div className="flex items-start gap-2 mt-4 p-3 rounded-xl text-sm"
            style={{ background: 'rgba(245,158,11,0.1)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.2)' }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Your last payment failed. Please update your payment method to restore access.</span>
          </div>
        )}

        {subscription?.stripe_customer_id && (
          <button
            onClick={handleManageBilling}
            disabled={isPending}
            className="flex items-center gap-2 mt-4 px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {isPending && !pendingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Manage billing &amp; invoices
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171' }}>
          {error}
        </p>
      )}

      {/* Plan cards */}
      <h2 className="text-sm font-semibold" style={{ color: '#94A3B8' }}>Available plans</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {(Object.entries(PLANS) as [PlanKey, typeof PLANS[PlanKey]][]).map(([key, plan]) => {
          const isCurrent = currentPlan === key && status === 'active'
          return (
            <div key={key}
              className="rounded-2xl p-5 flex flex-col gap-4"
              style={{
                background: isCurrent ? 'rgba(13,148,136,0.08)' : 'rgba(255,255,255,0.04)',
                border: isCurrent ? '1px solid rgba(13,148,136,0.4)' : '1px solid rgba(255,255,255,0.08)',
              }}>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold" style={{ color: '#F8FAFC' }}>{plan.name}</p>
                  {isCurrent && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(13,148,136,0.15)', color: '#0D9488' }}>
                      <CheckCircle className="w-3 h-3" /> Current
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold mb-0.5" style={{ color: '#F8FAFC' }}>
                  ₹{plan.price.toLocaleString()}
                  <span className="text-sm font-normal" style={{ color: '#64748B' }}>/month</span>
                </p>
                <p className="text-xs" style={{ color: '#64748B' }}>{plan.description}</p>
              </div>

              <ul className="space-y-1.5">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs" style={{ color: '#94A3B8' }}>
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#0D9488' }} />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(key)}
                disabled={isCurrent || isPending || !plan.priceId}
                className="py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mt-auto"
                style={{
                  background: isCurrent ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, #0D9488, #0891B2)',
                  color: isCurrent ? '#64748B' : '#fff',
                  opacity: (isPending && pendingPlan === key) ? 0.7 : 1,
                  cursor: isCurrent ? 'default' : 'pointer',
                  minHeight: '44px',
                }}
              >
                {isPending && pendingPlan === key
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</>
                  : isCurrent ? 'Current plan' : `Subscribe to ${plan.name}`
                }
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-center" style={{ color: '#64748B' }}>
        All plans billed monthly. Cancel anytime via the billing portal. Prices exclude GST.
      </p>
    </div>
  )
}
