export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { lastSupplier, listStockReceipts, lowStockPrefill, searchDrugs } from '@/app/actions/pharmacy'
import { listSuppliers } from '@/app/actions/inventory'
import ReceiveStockClient from './_components/ReceiveStockClient'
import type { Drug } from '@/lib/types'

interface Props { searchParams: Promise<{ q?: string; low?: string }> }

/** Pharmacy → Receive stock: a purchase invoice with many lines. */
export default async function ReceiveStockPage({ searchParams }: Props) {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'pharmacy:manage')) redirect('/pharmacy')

  // Opened from a stock row ("add batch") — start with that medicine on line 1.
  const { q, low } = await searchParams
  const [initialDrug, prefill, supplier, recent, suppliers] = await Promise.all([
    q ? searchDrugs(q, 1).then((r) => r[0] ?? null).catch(() => null) : Promise.resolve(null as Drug | null),
    low === '1' ? lowStockPrefill().catch(() => []) : Promise.resolve([]),
    lastSupplier().catch(() => null),
    listStockReceipts(5).catch(() => []),
    // Offered as the supplier is typed, so a distributor is spelt the same way every time.
    listSuppliers().then((s) => s.map((x) => x.name)).catch(() => [] as string[]),
  ])

  return <ReceiveStockClient initialDrug={initialDrug} prefill={prefill} lastSupplier={supplier} recent={recent} suppliers={suppliers} />
}
