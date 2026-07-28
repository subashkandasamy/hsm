import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { runDailyBillingForAllTenants } from '@/lib/cron/dailyBilling'

// Headless daily IPD billing sweep across all tenants. Invoked by Vercel Cron
// (see vercel.json), which sends `Authorization: Bearer <CRON_SECRET>`.
// Long-running (loops every tenant) — give it room and never cache.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail closed if no secret configured
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    const result = await runDailyBillingForAllTenants()
    const durationMs = Date.now() - startedAt
    if (result.errors.length) {
      console.error('[cron daily-billing] completed with errors', result)
    } else {
      console.log('[cron daily-billing] completed', { ...result, durationMs })
    }
    return NextResponse.json({ ok: true, durationMs, ...result })
  } catch (e) {
    console.error('[cron daily-billing] fatal', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
