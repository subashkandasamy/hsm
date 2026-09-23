export const dynamic = 'force-dynamic'
import { listLabOrders, listLabCatalog, labOrdersAwaitingPayment } from '@/app/actions/lab'
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

  return (
    <LabClient
      awaitingPayment={awaitingPayment}
      toCollect={toCollect}
      resultQueue={[...collected, ...processing]}
      verified={verified}
      reported={reported}
      catalog={catalog}
    />
  )
}
