export const dynamic = 'force-dynamic'
import { listClaims, getReceivables, listTpas } from '@/app/actions/insurance'
import InsuranceClient from './_components/InsuranceClient'

export default async function InsurancePage() {
  const [claims, receivables, tpas] = await Promise.all([
    listClaims(),
    getReceivables(),
    listTpas(),
  ])
  return <InsuranceClient initialClaims={claims} receivables={receivables} initialTpas={tpas} />
}
