export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { actorCan } from '@/lib/server-utils'
import PageHeader from '@/components/ui/PageHeader'
import { listMlc, listMlcOptions, listMlcPending } from '@/app/actions/mlc'
import MlcRegister from '../_components/MlcRegister'
import MlcPendingPanel from '../_components/MlcPendingPanel'

export default async function MlcRegisterPage() {
  if (!(await actorCan('emergency:read'))) redirect('/dashboard')

  const [rows, options, pending] = await Promise.all([
    listMlc(), listMlcOptions(), listMlcPending(),
  ])

  return (
    <div>
      <PageHeader
        title="Accident Register"
        subtitle="Every medico-legal case, with what the hospital owes on it. Kept because it is produced in court, sometimes years later."
      />
      {/*
        The same outstanding panel as the emergency board. Somebody who came
        here to work through the register should not have to go back to
        casualty to find out which entries have the police uninformed, or to
        act on it — this is the screen they are already on.
      */}
      <MlcPendingPanel initial={pending} />
      <MlcRegister rows={rows} options={options} />
    </div>
  )
}
