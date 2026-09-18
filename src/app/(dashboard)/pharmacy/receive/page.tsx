export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { searchDrugs } from '@/app/actions/pharmacy'
import ReceiveStockClient from './_components/ReceiveStockClient'
import type { Drug } from '@/lib/types'

interface Props { searchParams: Promise<{ drug?: string; q?: string }> }

/** Pharmacy → Receive stock: a purchase invoice with many lines. */
export default async function ReceiveStockPage({ searchParams }: Props) {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'pharmacy:manage')) redirect('/pharmacy')

  // Opened from a stock row ("add batch") — start with that medicine on line 1.
  const { q } = await searchParams
  let initialDrug: Drug | null = null
  if (q) initialDrug = (await searchDrugs(q, 1).catch(() => []))[0] ?? null

  return <ReceiveStockClient initialDrug={initialDrug} />
}
