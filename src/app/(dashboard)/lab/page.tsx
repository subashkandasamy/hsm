export const dynamic = 'force-dynamic'
import { listLabOrdersPage, countLabTabs, listLabCatalog, labOrdersAwaitingPayment, listOpenCriticalResults } from '@/app/actions/lab'
import { listSilentAnalyzers } from '@/app/actions/devices'
import LabClient from './_components/LabClient'

interface Props { searchParams: Promise<{ tab?: string; q?: string; from?: string; to?: string; page?: string; size?: string }> }

export default async function LaboratoryPage({ searchParams }: Props) {
  const sp = await searchParams
  const tab = ['collect', 'results', 'verify', 'reported'].includes(sp.tab ?? '') ? sp.tab! : 'collect'
  // One page of the open tab, counts for the others — all at once, nothing waiting on anything else.
  const [first, counts, catalog, critical, silent] = await Promise.all([
    listLabOrdersPage({ tab, q: sp.q, from: sp.from, to: sp.to, page: Number(sp.page) || 1, size: Number(sp.size) || undefined }),
    countLabTabs(),
    listLabCatalog(),
    listOpenCriticalResults(),
    // A live analyzer that has gone quiet. Anything it measured meanwhile is
    // sitting in its own memory, and nothing else tells the bench.
    listSilentAnalyzers(),
  ])
  // Computed here rather than after the first client refresh, so the worklist
  // never paints a live Collect button on a sample that is waiting on money.
  const awaitingPayment = tab === 'collect' ? await labOrdersAwaitingPayment(first.rows.map((o) => o.id)) : []

  return (
    <LabClient
      initial={first}
      initialTab={tab as 'collect' | 'results' | 'verify' | 'reported'}
      initialQuery={sp.q ?? ''}
      initialFrom={sp.from ?? ''}
      initialTo={sp.to ?? ''}
      counts={counts}
      awaitingPayment={awaitingPayment}
      critical={critical}
      silentAnalyzers={silent}
      catalog={catalog}
    />
  )
}
