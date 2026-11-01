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

  try {
    const result = await runDailyBillingForAllTenants()
    // A sweep that ran out of time is not a success, and used to be reported as
    // one (F-37). `complete` distinguishes the two, and an incomplete run is
    // logged at error level so it surfaces the same way a failure does.
    if (result.errors.length || !result.complete) {
      console.error('[cron daily-billing] completed with errors or incomplete', result)
    } else {
      console.log('[cron daily-billing] completed', result)
    }
    // Still HTTP 200: the work that was done is durable and the platform must
    // not retry the whole sweep. The payload says what was missed.
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[cron daily-billing] fatal', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
