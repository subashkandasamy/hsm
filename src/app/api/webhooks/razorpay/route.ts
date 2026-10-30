import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { PLANS } from '@/lib/razorpay-plans'
import { DEFAULT_COMMISSION_PCT } from '@/lib/referral'

// No `?? ''` fallback. An empty secret does not close this door, it unlocks
// it: anyone can sign a body with an empty key, so a missing setting would
// turn signature checking into a formality. Razorpay signs with the real
// secret, so if ours were empty no genuine webhook would verify either — the
// only traffic that worked would be forged. Fail closed, as the cron route does.
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? ''

/** Constant-time compare of two hex signatures of equal length. */
function signatureMatches(received: string, expected: string): boolean {
  const a = Buffer.from(received, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

type Svc = ReturnType<typeof createServiceClient>

// Accrue referral commission when a referred tenant is charged. Commission is a
// % of the NET plan price; idempotent on the Razorpay payment id; respects the
// partner's optional duration cap. Never throws — billing must not be affected.
async function accrueReferralCommission(
  service: Svc,
  opts: { tenantId: string; plan: string; paymentId: string | null },
) {
  const { tenantId, plan, paymentId } = opts
  if (!tenantId || !paymentId) return
  try {
    const { data: tenant } = await service.from('tenants')
      .select('referred_by_partner_id').eq('id', tenantId).maybeSingle()
    const partnerId = tenant?.referred_by_partner_id as string | null
    if (!partnerId) return

    const { data: partner } = await service.from('partners')
      .select('id, tenant_id, type, commission_pct, commission_duration_months, status')
      .eq('id', partnerId).maybeSingle()
    if (!partner || partner.status !== 'active') return

    // Duration cap: stop after N accrued charges if the partner has a cap.
    const cap = partner.commission_duration_months as number | null
    if (cap) {
      const { count } = await service.from('partner_commissions')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', partnerId).eq('referred_tenant_id', tenantId)
        .in('status', ['accrued', 'paid'])
      if ((count ?? 0) >= cap) return
    }

    const base = PLANS[plan as keyof typeof PLANS]?.price ?? 0
    if (base <= 0) return
    const pct = (partner.commission_pct as number | null) ?? DEFAULT_COMMISSION_PCT
    const amount = Math.round(base * (pct / 100) * 100) / 100

    await service.from('partner_commissions').insert({
      partner_id: partnerId,
      referred_tenant_id: tenantId,
      source_payment_id: paymentId,
      period: new Date().toISOString().slice(0, 7),
      base_amount: base,
      commission_pct: pct,
      commission_amount: amount,
      payout_type: partner.type === 'tenant' ? 'credit' : 'cash',
    })
    // Unique(source_payment_id) makes duplicate webhook deliveries a no-op (23505).
  } catch (e) {
    console.error('[razorpay webhook] commission accrual failed:', e)
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-razorpay-signature') ?? ''

  if (!WEBHOOK_SECRET) {
    console.error('[razorpay webhook] RAZORPAY_WEBHOOK_SECRET is not set — refusing every webhook')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }

  const expectedSig = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')
  if (!signatureMatches(signature, expectedSig)) {
    console.error('[razorpay webhook] signature mismatch')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let payload: any
  try { payload = JSON.parse(rawBody) } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event   = payload.event as string
  // Subscription events carry entity under payload.subscription.entity
  // Payment events carry it under payload.payment.entity
  const subEntity = payload.payload?.subscription?.entity
  const payEntity = payload.payload?.payment?.entity

  const service = createServiceClient()

  try {
    switch (event) {

      // First successful charge — subscription is now active
      case 'subscription.activated': {
        const tenantId = subEntity?.notes?.tenant_id
        const plan     = subEntity?.notes?.plan ?? 'starter'
        const subId    = subEntity?.id
        if (!tenantId || !subId) break

        const periodEnd = subEntity?.current_end
          ? new Date(subEntity.current_end * 1000).toISOString()
          : null

        await service.from('subscriptions').update({
          status:             'active',
          plan,
          current_period_end: periodEnd,
        }).eq('stripe_subscription_id', subId)

        await service.from('tenants').update({ status: 'active', plan }).eq('id', tenantId)
        break
      }

      // Monthly renewal charged successfully
      case 'subscription.charged': {
        const subId = subEntity?.id
        if (!subId) break

        const { data: row } = await service
          .from('subscriptions').select('tenant_id, plan').eq('stripe_subscription_id', subId).maybeSingle()
        if (!row?.tenant_id) break

        const periodEnd = subEntity?.current_end
          ? new Date(subEntity.current_end * 1000).toISOString()
          : null

        await service.from('subscriptions').update({ status: 'active', current_period_end: periodEnd })
          .eq('stripe_subscription_id', subId)
        await service.from('tenants').update({ status: 'active' }).eq('id', row.tenant_id)

        // Referral commission — one accrual per successful charge (first + renewals).
        await accrueReferralCommission(service, {
          tenantId: row.tenant_id as string,
          plan: (row.plan as string) ?? subEntity?.notes?.plan ?? 'starter',
          paymentId: (payEntity?.id as string) ?? null,
        })
        break
      }

      // A charge was refunded — reverse any commission accrued on it.
      case 'refund.created':
      case 'refund.processed': {
        const refundedPaymentId = payload.payload?.refund?.entity?.payment_id as string | undefined
        if (!refundedPaymentId) break
        await service.from('partner_commissions')
          .update({ status: 'reversed' })
          .eq('source_payment_id', refundedPaymentId).eq('status', 'accrued')
        break
      }

      // Payment failed on a subscription charge
      case 'payment.failed': {
        // payEntity.subscription_id links back to the subscription
        const subId = payEntity?.subscription_id
        if (!subId) break

        const { data: row } = await service
          .from('subscriptions').select('tenant_id').eq('stripe_subscription_id', subId).maybeSingle()
        if (!row?.tenant_id) break

        await service.from('subscriptions').update({ status: 'past_due' }).eq('stripe_subscription_id', subId)
        await service.from('tenants').update({ status: 'past_due' }).eq('id', row.tenant_id)
        break
      }

      // 3 consecutive payment failures — Razorpay halts the subscription
      case 'subscription.halted': {
        const subId = subEntity?.id
        if (!subId) break

        const { data: row } = await service
          .from('subscriptions').select('tenant_id').eq('stripe_subscription_id', subId).maybeSingle()
        if (!row?.tenant_id) break

        await service.from('subscriptions').update({ status: 'past_due' }).eq('stripe_subscription_id', subId)
        await service.from('tenants').update({ status: 'past_due' }).eq('id', row.tenant_id)
        break
      }

      // Cancelled by admin or customer
      case 'subscription.cancelled':
      case 'subscription.completed': {
        const subId = subEntity?.id
        if (!subId) break

        const { data: row } = await service
          .from('subscriptions').select('tenant_id').eq('stripe_subscription_id', subId).maybeSingle()
        if (!row?.tenant_id) break

        // Use end_at if present (Razorpay sends it on cancel), fall back to current_end
        const endTimestamp = subEntity?.end_at ?? subEntity?.current_end
        const periodEnd = endTimestamp ? new Date(endTimestamp * 1000).toISOString() : null

        await service.from('subscriptions').update({
          status: 'cancelled',
          ...(periodEnd ? { current_period_end: periodEnd } : {}),
        }).eq('stripe_subscription_id', subId)
        await service.from('tenants').update({ status: 'cancelled' }).eq('id', row.tenant_id)
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error('[razorpay webhook] error:', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
