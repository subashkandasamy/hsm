export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { listProcedureTariffs } from '@/app/actions/tariffs'
import { getDiscountLimits } from '@/app/actions/discounts'
import PageHeader from '@/components/ui/PageHeader'
import TariffsManager from './_components/TariffsManager'
import DiscountLimitsCard from './_components/DiscountLimitsCard'
import ErFeeCard from './_components/ErFeeCard'
import { getErRegistrationFee } from '@/app/actions/emergency'

export default async function TariffsPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'tariffs:manage')) redirect('/dashboard')

  const [tariffs, discountLimits, erFee] = await Promise.all([listProcedureTariffs(), getDiscountLimits(), getErRegistrationFee()])

  return (
    <div>
      <PageHeader
        title="Tariffs & Fees"
        subtitle="Configure procedure pricing and role-wise discount limits. Doctor consultation fees are set under Staff & HR; room rates on the Ward Board."
      />
      <TariffsManager initialTariffs={tariffs} />
      <ErFeeCard initial={erFee} />
      <DiscountLimitsCard initial={discountLimits} />
    </div>
  )
}
