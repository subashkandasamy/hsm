export const dynamic = 'force-dynamic'
import { listRadiologyOrdersPage, countRadiologyTabs, listRadiologyCatalog, type RadiologyTab } from '@/app/actions/radiology'
import RadiologyClient from './_components/RadiologyClient'

interface Props { searchParams: Promise<{ tab?: string; q?: string; from?: string; to?: string; page?: string; size?: string }> }

export default async function RadiologyPage({ searchParams }: Props) {
  const sp = await searchParams
  const tab: RadiologyTab = sp.tab === 'performed' || sp.tab === 'reported' ? sp.tab : 'pending'
  const [first, counts, catalog] = await Promise.all([
    listRadiologyOrdersPage({ tab, q: sp.q, from: sp.from, to: sp.to, page: Number(sp.page) || 1, size: Number(sp.size) || undefined }),
    countRadiologyTabs(),
    listRadiologyCatalog(),
  ])

  return (
    <RadiologyClient
      initial={first}
      initialTab={tab}
      initialQuery={sp.q ?? ''}
      initialFrom={sp.from ?? ''}
      initialTo={sp.to ?? ''}
      counts={counts}
      catalog={catalog}
    />
  )
}
