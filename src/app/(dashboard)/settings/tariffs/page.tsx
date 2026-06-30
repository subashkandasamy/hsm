import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { listWardsWithRates } from '@/app/actions/tariffs'
import { listProcedureTariffs } from '@/app/actions/tariffs'
import PageHeader from '@/components/ui/PageHeader'
import TariffsManager from './_components/TariffsManager'

export default async function TariffsPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'tariffs:manage')) redirect('/dashboard')

  const [wards, tariffs] = await Promise.all([
    listWardsWithRates(),
    listProcedureTariffs(),
  ])

  return (
    <div>
      <PageHeader
        title="Tariffs & Fees"
        subtitle="Configure ward room rates, procedure pricing, and default consultation fees."
      />
      <TariffsManager initialWards={wards} initialTariffs={tariffs} />
    </div>
  )
}
