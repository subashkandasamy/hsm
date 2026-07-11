export const dynamic = 'force-dynamic'
import { listLabOrders, listLabCatalog } from '@/app/actions/lab'
import LabClient from './_components/LabClient'

export default async function LaboratoryPage() {
  const [toCollect, collected, processing, reported, catalog] = await Promise.all([
    listLabOrders({ status: 'ordered' }),
    listLabOrders({ status: 'collected' }),
    listLabOrders({ status: 'processing' }),
    listLabOrders({ status: 'reported' }),
    listLabCatalog(),
  ])

  return (
    <LabClient
      toCollect={toCollect}
      resultQueue={[...collected, ...processing]}
      reported={reported}
      catalog={catalog}
    />
  )
}
