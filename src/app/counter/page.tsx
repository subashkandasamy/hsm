import { headers } from 'next/headers'
import { getCounterState } from '@/app/actions/counter'
import CounterClient from './_components/CounterClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Switch user — Uyirly', robots: { index: false, follow: false } }

/**
 * The shared-counter PIN screen (0272). Public in proxy.ts — being signed out
 * is its normal state — but it shows nothing unless this browser is a counter
 * an admin approved for this hospital.
 */
export default async function CounterPage() {
  const hospitalName = (await headers()).get('x-tenant-name')
  const state = await getCounterState()
  return <CounterClient hospitalName={hospitalName} state={state} />
}
