export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { listProcedureTariffs } from '@/app/actions/tariffs'
import PageHeader from '@/components/ui/PageHeader'
import TariffsManager from './_components/TariffsManager'

export default async function TariffsPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'tariffs:manage')) redirect('/dashboard')

  const tariffs = await listProcedureTariffs()

  return (
    <div>
      <PageHeader
        title="Tariffs & Fees"
        subtitle="Configure procedure pricing and default consultation fees. Room rates are managed on the Ward Board."
      />
      <TariffsManager initialTariffs={tariffs} />
    </div>
  )
}
