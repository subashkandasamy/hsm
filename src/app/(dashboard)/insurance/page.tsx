export const dynamic = 'force-dynamic'
import { listClaims, getReceivables, listTpas, listBankAccounts, listTariffPackages, listRemittanceBatches } from '@/app/actions/insurance'
import InsuranceClient from './_components/InsuranceClient'

export default async function InsurancePage() {
  const [claims, receivables, tpas, bankAccounts, tariffPackages, remittanceBatches] = await Promise.all([
    listClaims(),
    getReceivables(),
    listTpas(),
    listBankAccounts(),
    listTariffPackages(),
    listRemittanceBatches(),
  ])
  return (
    <InsuranceClient
      initialClaims={claims}
      receivables={receivables}
      initialTpas={tpas}
      initialBankAccounts={bankAccounts}
      initialTariffPackages={tariffPackages}
      initialRemittanceBatches={remittanceBatches}
    />
  )
}
