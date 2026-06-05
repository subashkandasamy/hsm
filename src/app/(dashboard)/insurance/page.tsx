import { listClaims } from '@/app/actions/insurance'
import InsuranceClient from './_components/InsuranceClient'

export default async function InsurancePage() {
  const claims = await listClaims()
  return <InsuranceClient initialClaims={claims} />
}
