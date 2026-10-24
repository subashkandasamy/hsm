export const dynamic = 'force-dynamic'
import { listLabOrders, listLabCatalog, labOrdersAwaitingPayment, listOpenCriticalResults } from '@/app/actions/lab'
import { listSilentAnalyzers } from '@/app/actions/devices'
import LabClient from './_components/LabClient'

export default async function LaboratoryPage() {
  const [toCollect, collected, processing, verified, reported, catalog] = await Promise.all([
    listLabOrders({ status: 'ordered' }),
    listLabOrders({ status: 'collected' }),
    listLabOrders({ status: 'processing' }),
    listLabOrders({ status: 'verified' }),
    listLabOrders({ status: 'reported' }),
    listLabCatalog(),
  ])

  // Computed here rather than after the first client refresh, so the worklist
  // never paints a live Collect button on a sample that is waiting on money.
  const awaitingPayment = await labOrdersAwaitingPayment(toCollect.map((o) => o.id))
  const critical = await listOpenCriticalResults()
  // A live analyzer that has gone quiet. Anything it measured meanwhile is
  // sitting in its own memory, and nothing else tells the bench.
  const silent = await listSilentAnalyzers()

  return (
    <LabClient
      awaitingPayment={awaitingPayment}
      critical={critical}
      silentAnalyzers={silent}
      toCollect={toCollect}
      resultQueue={[...collected, ...processing]}
      verified={verified}
      reported={reported}
      catalog={catalog}
    />
  )
}
