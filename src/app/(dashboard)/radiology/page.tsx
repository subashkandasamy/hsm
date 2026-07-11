export const dynamic = 'force-dynamic'
import { listRadiologyOrders, listRadiologyCatalog } from '@/app/actions/radiology'
import RadiologyClient from './_components/RadiologyClient'

export default async function RadiologyPage() {
  const [pending, performed, reported, catalog] = await Promise.all([
    listRadiologyOrders({ status: 'ordered' }),
    listRadiologyOrders({ status: 'performed' }),
    listRadiologyOrders({ status: 'reported' }),
    listRadiologyCatalog(),
  ])

  return (
    <RadiologyClient
      pending={pending}
      performed={performed}
      reported={reported}
      catalog={catalog}
    />
  )
}
