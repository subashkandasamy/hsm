export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { listProcedureTariffs } from '@/app/actions/tariffs'
import { getDiscountLimits } from '@/app/actions/discounts'
import PageHeader from '@/components/ui/PageHeader'
import TariffsManager from './_components/TariffsManager'
import DiscountLimitsCard from './_components/DiscountLimitsCard'

export default async function TariffsPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'tariffs:manage')) redirect('/dashboard')

  const [tariffs, discountLimits] = await Promise.all([listProcedureTariffs(), getDiscountLimits()])

  return (
    <div>
      <PageHeader
        title="Tariffs & Fees"
        subtitle="Configure procedure pricing and default consultation fees. Room rates are managed on the Ward Board."
      />
      <TariffsManager initialTariffs={tariffs} />
      <DiscountLimitsCard initial={discountLimits} />
    </div>
  )
}
