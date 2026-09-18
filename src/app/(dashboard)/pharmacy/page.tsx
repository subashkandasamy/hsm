export const dynamic = 'force-dynamic'
import {
  listPendingPrescriptions,
  getStock,
  getAlerts,
  listPackedAwaitingDispatch,
  listDispatchedHistory,
} from '@/app/actions/pharmacy'
import { listPharmacySales } from '@/app/actions/pharmacySale'
import { listPatients } from '@/app/actions/patients'
import { listIpdPharmacyRequests } from '@/app/actions/ipdTreatment'
import { listVaccineOrders, listVaccineStock } from '@/app/actions/vaccination'
import PharmacyClient from './_components/PharmacyClient'

export default async function PharmacyPage() {
  const [pending, stock, alerts, readySales, fulfilledSales, patients, awaitingDispatch, ipdRequests, opdHistory, vaccineOrders, vaccineStock] = await Promise.all([
    listPendingPrescriptions(),
    getStock(),
    getAlerts(),
    listPharmacySales({ status: 'billed' }),
    listPharmacySales({ status: 'fulfilled' }),
    listPatients(),
    listPackedAwaitingDispatch(),
    listIpdPharmacyRequests(),
    listDispatchedHistory(),
    listVaccineOrders().catch(() => []),
    listVaccineStock().catch(() => []),
  ])

  return (
    <PharmacyClient
      initialPending={pending}
      initialStock={stock}
      initialAlerts={alerts}
      initialReadySales={readySales}
      initialFulfilledSales={fulfilledSales}
      allPatients={patients}
      initialAwaitingDispatch={awaitingDispatch}
      initialIpdRequests={ipdRequests}
      initialOpdHistory={opdHistory}
      initialVaccineOrders={vaccineOrders}
      initialVaccineStock={vaccineStock}
    />
  )
}
