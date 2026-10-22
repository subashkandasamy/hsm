export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import PageHeader from '@/components/ui/PageHeader'
import { listMtp, getMtpDrugStatus } from '@/app/actions/pcpndt'
import MtpRegister from '../_components/MtpRegister'
import { istToday } from '@/lib/istDate'

export default async function MtpPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'pcpndt:record')) redirect('/dashboard')

  const month = istToday().slice(0, 7)
  const [rows, drugs] = await Promise.all([listMtp(month), getMtpDrugStatus(month)])

  return (
    <div>
      <PageHeader
        title="MTP register"
        subtitle="Terminations, and the drug stock the monthly return is read against."
      />
      <MtpRegister initialRows={rows} initialDrugs={drugs} initialMonth={month} />
    </div>
  )
}
