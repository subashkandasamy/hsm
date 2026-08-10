export const dynamic = 'force-dynamic'

import { listEstimates } from '@/app/actions/costEstimates'
import { listWardRoomTypes } from '@/app/actions/wards'
import { listProcedureTariffs } from '@/app/actions/tariffs'
import EstimatesClient from './_components/EstimatesClient'

export default async function EstimatesPage() {
  const [estimates, roomTypes, procedures] = await Promise.all([
    listEstimates(),
    listWardRoomTypes().catch(() => []),
    listProcedureTariffs().catch(() => []),
  ])
  return <EstimatesClient initial={estimates} roomTypes={roomTypes} procedures={procedures} />
}
