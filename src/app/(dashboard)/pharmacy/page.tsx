export const dynamic = 'force-dynamic'
import {
  listPendingPrescriptions,
  getStockAndAlerts,
  listPackedAwaitingDispatch,
  listDispatchedHistory,
} from '@/app/actions/pharmacy'
import { listPharmacySales } from '@/app/actions/pharmacySale'
import { listIpdPharmacyRequests } from '@/app/actions/ipdTreatment'
import { listVaccineOrders, listVaccineStock } from '@/app/actions/vaccination'
import { getPayFirst } from '@/app/actions/billingSettings'
import PharmacyClient from './_components/PharmacyClient'

export default async function PharmacyPage() {
  const [pending, { stock, alerts }, readySales, fulfilledSales, awaitingDispatch, ipdRequests, opdHistory, vaccineOrders, vaccineStock, pharmacyPayFirst] = await Promise.all([
    listPendingPrescriptions(),
    getStockAndAlerts(),
    listPharmacySales({ status: 'billed' }),
    listPharmacySales({ status: 'fulfilled' }),
    listPackedAwaitingDispatch(),
    listIpdPharmacyRequests(),
    listDispatchedHistory(),
    listVaccineOrders().catch(() => []),
    listVaccineStock().catch(() => []),
    getPayFirst('pharmacy'),
  ])

  return (
    <PharmacyClient
      initialPending={pending}
      initialStock={stock}
      initialAlerts={alerts}
      initialReadySales={readySales}
      initialFulfilledSales={fulfilledSales}
      initialAwaitingDispatch={awaitingDispatch}
      initialIpdRequests={ipdRequests}
      initialOpdHistory={opdHistory}
      initialVaccineOrders={vaccineOrders}
      pharmacyPayFirst={pharmacyPayFirst}
      initialVaccineStock={vaccineStock}
    />
  )
}
