import { listPendingPrescriptions, getStock, getAlerts, listDrugs } from '@/app/actions/pharmacy'
import PharmacyClient from './_components/PharmacyClient'

export default async function PharmacyPage() {
  const [pending, stock, alerts, drugs] = await Promise.all([
    listPendingPrescriptions(),
    getStock(),
    getAlerts(),
    listDrugs(),
  ])

  return (
    <PharmacyClient
      initialPending={pending}
      initialStock={stock}
      initialAlerts={alerts}
      drugs={drugs}
    />
  )
}
