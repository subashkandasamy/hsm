export const dynamic = 'force-dynamic'
import { getInventory, listUnits, listRequests, listDonors } from '@/app/actions/blood'
import BloodClient from './_components/BloodClient'

export default async function BloodBankPage() {
  const [inventory, units, requests, donors] = await Promise.all([
    getInventory(),
    listUnits(),
    listRequests(),
    listDonors(),
  ])
  return (
    <BloodClient
      initialInventory={inventory}
      initialUnits={units}
      initialRequests={requests}
      initialDonors={donors}
    />
  )
}
