export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import PageHeader from '@/components/ui/PageHeader'
import { listMlc, listMlcOptions } from '@/app/actions/mlc'
import MlcRegister from '../_components/MlcRegister'

export default async function MlcRegisterPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'emergency:read')) redirect('/dashboard')

  const [rows, options] = await Promise.all([listMlc(), listMlcOptions()])

  return (
    <div>
      <PageHeader
        title="Accident Register"
        subtitle="Every medico-legal case, with what the hospital owes on it. Kept because it is produced in court, sometimes years later."
      />
      <MlcRegister rows={rows} options={options} />
    </div>
  )
}
