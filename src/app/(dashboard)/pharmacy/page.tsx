import {
  listPendingPrescriptions,
  getStock,
  getAlerts,
  listDrugs,
  listPackedAwaitingDispatch,
} from '@/app/actions/pharmacy'
import { listPharmacySales } from '@/app/actions/pharmacySale'
import { listPatients } from '@/app/actions/patients'
import { listIpdPharmacyRequests } from '@/app/actions/ipdTreatment'
import PharmacyClient from './_components/PharmacyClient'

export default async function PharmacyPage() {
  const [pending, stock, alerts, drugs, readySales, patients, awaitingDispatch, ipdRequests] = await Promise.all([
    listPendingPrescriptions(),
    getStock(),
    getAlerts(),
    listDrugs(),
    listPharmacySales({ status: 'billed' }),
    listPatients(),
    listPackedAwaitingDispatch(),
    listIpdPharmacyRequests(),
  ])

  return (
    <PharmacyClient
      initialPending={pending}
      initialStock={stock}
      initialAlerts={alerts}
      drugs={drugs}
      initialReadySales={readySales}
      allPatients={patients}
      initialAwaitingDispatch={awaitingDispatch}
      initialIpdRequests={ipdRequests}
    />
  )
}
