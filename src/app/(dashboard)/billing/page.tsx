import { listBills } from '@/app/actions/billing'
import BillingClient from './_components/BillingClient'

export default async function BillingPage() {
  const bills = await listBills()
  return <BillingClient initialBills={bills} />
}
