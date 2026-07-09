import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createHmac } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? ''

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-razorpay-signature') ?? ''

  const expectedSig = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')
  if (signature !== expectedSig) {
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
          .from('subscriptions').select('tenant_id').eq('stripe_subscription_id', subId).maybeSingle()
        if (!row?.tenant_id) break

        const periodEnd = subEntity?.current_end
          ? new Date(subEntity.current_end * 1000).toISOString()
          : null

        await service.from('subscriptions').update({ status: 'active', current_period_end: periodEnd })
          .eq('stripe_subscription_id', subId)
        await service.from('tenants').update({ status: 'active' }).eq('id', row.tenant_id)
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
