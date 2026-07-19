export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { getIpdConfig, getAdvancePercentage, listCustomCharges } from '@/app/actions/ipdConfig'
import { DEFAULT_DECLARATION_TEMPLATE } from '@/lib/ipdDeclarationTemplate'
import PageHeader from '@/components/ui/PageHeader'
import IpdBillingConfigClient from './_components/IpdBillingConfig'
import type { IpdBillingConfig } from '@/lib/types'

export default async function IpdBillingPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'ipd:config')) redirect('/dashboard')

  const [config, advancePercentage, customCharges] = await Promise.all([
    getIpdConfig(),
    getAdvancePercentage(),
    listCustomCharges(),
  ])

  // Provide defaults for a tenant that hasn't configured yet (row seeded by migration)
  const cfg: IpdBillingConfig = config ?? {
    tenant_id:              actor.tenant_id,
    charge_room_rent:       true,
    charge_doctor_fee:      true,
    charge_nursing:         true,
    charge_medicines:       true,
    charge_admission_fee:   false,
    admission_fee_amount:   0,
    service_charge_per_day: 0,
    declaration_template:   DEFAULT_DECLARATION_TEMPLATE,
    updated_at:             new Date().toISOString(),
  }

  return (
    <div>
      <PageHeader
        title="IPD Billing Configuration"
        subtitle="Set the advance deposit percentage and control what's included in each patient's daily auto-bill."
      />
      <IpdBillingConfigClient config={cfg} advancePercentage={advancePercentage} initialCustomCharges={customCharges} />
    </div>
  )
}
