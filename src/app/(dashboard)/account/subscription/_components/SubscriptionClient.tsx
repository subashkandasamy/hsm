'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  CheckCircle, Loader2, AlertTriangle, XCircle,
  Zap, Building2, ArrowRight, IndianRupee,
} from 'lucide-react'
import { createCheckoutSession, cancelSubscription } from '@/app/actions/subscription'
import { PLANS } from '@/lib/razorpay-plans'
import type { PlanKey } from '@/lib/razorpay-plans'
import type { Subscription, Tenant } from '@/lib/types'

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof (window as any).Razorpay !== 'undefined') { resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload  = () => resolve()
    s.onerror = () => reject(new Error('Razorpay script failed to load'))
    document.head.appendChild(s)
  })
}

interface Props {
  subscription: Subscription | null
  tenant:       Tenant | null
  success?:     boolean
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active:    { label: 'Active',    color: '#0F766E', bg: '#F0FDFA', border: 'rgba(13,148,136,0.25)' },
  trial:     { label: 'Free Trial',color: '#6D28D9', bg: '#F5F3FF', border: 'rgba(139,92,246,0.25)' },
  past_due:  { label: 'Past due',  color: '#B45309', bg: '#FFFBEB', border: 'rgba(245,158,11,0.25)' },
  suspended: { label: 'Suspended', color: '#B91C1C', bg: '#FEF2F2', border: 'rgba(239,68,68,0.25)' },
  cancelled: { label: 'Cancelled', color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0'               },
}

const PAYMENT_METHODS = ['UPI AutoPay', 'Credit / Debit card', 'Net banking']

export default function SubscriptionClient({ subscription, tenant, success }: Props) {
  const [error,       setError]        = useState('')
  const [confirm,     setConfirm]      = useState(false)
  const [isPending,   startTransition] = useTransition()
  const [pendingPlan, setPendingPlan]  = useState<PlanKey | null>(null)


  const handleSubscribe = (plan: PlanKey) => {
    setError('')
    setPendingPlan(plan)
    startTransition(async () => {
      const res = await createCheckoutSession(plan)
      if (!res.success) { setError(res.error); setPendingPlan(null); return }

      if (res.keyId && res.subscriptionId) {
        try {
          await loadRazorpayScript()
          const rzp = new (window as any).Razorpay({
            key:             res.keyId,
            subscription_id: res.subscriptionId,
            name:            'Uyirly HMS',
            description:     'Monthly subscription',
            theme:           { color: '#0D9488' },
            handler:         () => { window.location.href = '/account/subscription?success=1' },
            modal:           { ondismiss: () => setPendingPlan(null) },
          })
          rzp.open()
        } catch {
          // fallback: open hosted page if script fails
          window.location.href = res.url
        }
      } else {
        window.location.href = res.url
      }
    })
  }

  const handleCancel = () => {
    if (!confirm) { setConfirm(true); return }
    setError('')
    setConfirm(false)
    startTransition(async () => {
      const res = await cancelSubscription()
      if (!res.success) setError(res.error)
    })
  }

  const currentPlan   = subscription?.plan ?? tenant?.plan ?? 'starter'
  const status        = tenant?.status ?? 'trial'
  const statusCfg     = STATUS_CONFIG[status] ?? STATUS_CONFIG.trial
  const hasActiveSub  = !!subscription?.stripe_subscription_id && status !== 'cancelled'

  return (
    <div className="space-y-6">

      {/* ── Payment success banner ── */}
      {success && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl"
          style={{ background: 'linear-gradient(135deg, #f0fdfa, #ecfdf5)', border: '1px solid rgba(13,148,136,0.3)' }}>
          <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#0D9488' }} />
          <div>
            <p className="text-sm font-bold" style={{ color: '#0F172A' }}>Payment successful!</p>
            <p className="text-xs mt-0.5" style={{ color: '#0F766E' }}>
              Your subscription is being activated. It may take a moment to reflect below.
            </p>
          </div>
        </div>
      )}

      {/* ── Current status card ── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>

        {/* Header band */}
        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
          style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%)', borderBottom: '1px solid #E2E8F0' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.2)' }}>
              <Building2 className="w-5 h-5" style={{ color: '#0D9488' }} />
            </div>
            <div>
              <p className="text-base font-bold" style={{ color: '#0F172A' }}>{tenant?.name ?? 'Your hospital'}</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                {PLANS[currentPlan as PlanKey]?.name ?? 'Starter'} plan
              </p>
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border}` }}>
            {statusCfg.label}
          </span>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Renewal date */}
          {subscription?.current_period_end && (
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: '#64748B' }}>Next renewal</span>
              <span className="font-semibold" style={{ color: '#0F172A' }}>
                {new Date(subscription.current_period_end).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </span>
            </div>
          )}

          {/* Past due alert */}
          {status === 'past_due' && (
            <div className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: '#FFFBEB', border: '1px solid rgba(245,158,11,0.3)' }}>
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#B45309' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: '#B45309' }}>Payment failed</p>
                <p className="text-xs mt-0.5" style={{ color: '#92400E' }}>
                  Your last payment didn't go through. Subscribe again to restore full access.
                </p>
              </div>
            </div>
          )}

          {/* Payment methods */}
          <div>
            <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#94A3B8' }}>
              Accepted payment methods
            </p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map(m => (
                <span key={m} className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: '#F0FDFA', color: '#0F766E', border: '1px solid rgba(13,148,136,0.2)' }}>
                  {m}
                </span>
              ))}
            </div>
          </div>

          {/* Cancel */}
          {hasActiveSub && (
            <div className="pt-1">
              {confirm ? (
                <div className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: '#FEF2F2', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <p className="text-xs flex-1" style={{ color: '#B91C1C' }}>
                    Cancel at end of current billing period?
                  </p>
                  <button onClick={handleCancel} disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: '#DC2626', color: '#fff' }}>
                    {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                    Yes, cancel
                  </button>
                  <button onClick={() => setConfirm(false)} className="text-xs font-medium" style={{ color: '#64748B' }}>
                    Keep plan
                  </button>
                </div>
              ) : (
                <button onClick={handleCancel} disabled={isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ background: '#fff', color: '#DC2626', border: '1px solid rgba(220,38,38,0.35)', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}>
                  <XCircle className="w-4 h-4" /> Cancel subscription
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Plans ── */}
      <div>
        <p className="text-base font-bold mb-4" style={{ color: '#0F172A' }}>Available plans</p>
        <div className="grid gap-4 md:grid-cols-2">
          {(Object.entries(PLANS) as [PlanKey, typeof PLANS[PlanKey]][]).map(([key, plan], i) => {
            const isCurrent = currentPlan === key && status === 'active'
            const isGrowth  = key === 'growth'

            return (
              <div key={key} className="rounded-2xl flex flex-col overflow-hidden"
                style={{
                  background: '#fff',
                  border: isCurrent
                    ? '2px solid #0D9488'
                    : isGrowth ? '1px solid rgba(13,148,136,0.3)' : '1px solid #E2E8F0',
                  boxShadow: isCurrent
                    ? '0 0 0 4px rgba(13,148,136,0.08), 0 4px 24px rgba(13,148,136,0.12)'
                    : '0 1px 8px rgba(0,0,0,0.04)',
                }}>

                {/* Most popular — full-width top strip, no overlap */}
                {isGrowth && !isCurrent && (
                  <div className="py-2 text-center text-xs font-bold tracking-widest uppercase"
                    style={{ background: '#0D9488', color: '#fff' }}>
                    Most popular
                  </div>
                )}

                {/* Plan header */}
                <div className="px-6 pt-5 pb-4"
                  style={{ background: isGrowth ? 'linear-gradient(135deg, #f0fdfa, #ffffff)' : '#FAFAFA', borderBottom: '1px solid #F1F5F9' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: isGrowth ? '#0D9488' : '#E2E8F0' }}>
                      {isGrowth
                        ? <Zap className="w-3.5 h-3.5" style={{ color: '#fff' }} />
                        : <Building2 className="w-3.5 h-3.5" style={{ color: '#64748B' }} />
                      }
                    </div>
                    <p className="font-bold text-base" style={{ color: '#0F172A' }}>{plan.name}</p>
                    {isCurrent && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ml-auto"
                        style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
                        <CheckCircle className="w-3 h-3" /> Current
                      </span>
                    )}
                  </div>

                  <div className="flex items-end gap-1">
                    <IndianRupee className="w-5 h-5 mb-1" style={{ color: '#0F172A' }} />
                    <span className="text-4xl font-bold" style={{ color: '#0F172A' }}>
                      {plan.price.toLocaleString('en-IN')}
                    </span>
                    <span className="text-sm mb-1" style={{ color: '#94A3B8' }}>/month</span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: '#64748B' }}>{plan.description}</p>
                </div>

                {/* Features */}
                <div className="px-6 py-5 flex-1">
                  <ul className="space-y-3">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2.5">
                        <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5"
                          style={{ color: isGrowth ? '#0D9488' : '#94A3B8' }} />
                        <span className="text-sm" style={{ color: '#334155' }}>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA */}
                <div className="px-6 pb-6">
                  <button
                    onClick={() => handleSubscribe(key)}
                    disabled={isCurrent || isPending}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
                    style={{
                      background: isCurrent
                        ? '#F1F5F9'
                        : isGrowth
                          ? 'linear-gradient(135deg, #0D9488, #0891B2)'
                          : '#0F172A',
                      color:  isCurrent ? '#94A3B8' : '#fff',
                      cursor: isCurrent ? 'default' : 'pointer',
                      opacity: isPending && pendingPlan === key ? 0.75 : 1,
                      minHeight: '48px',
                      boxShadow: isCurrent ? 'none' : isGrowth
                        ? '0 4px 16px rgba(13,148,136,0.35)'
                        : '0 4px 12px rgba(15,23,42,0.2)',
                      transition: 'opacity 0.2s',
                    }}>
                    {isPending && pendingPlan === key
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</>
                      : isCurrent
                        ? 'Current plan'
                        : <>Subscribe <ArrowRight className="w-4 h-4" /></>
                    }
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-center pb-4" style={{ color: '#94A3B8' }}>
        Billed monthly. Cancel anytime. Prices exclude GST.{' '}
        <Link href="/pricing" style={{ color: '#0D9488' }}>Compare plans →</Link>
      </p>
    </div>
  )
}
