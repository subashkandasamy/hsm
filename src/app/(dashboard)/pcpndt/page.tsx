export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import PageHeader from '@/components/ui/PageHeader'
import { listFormF, countIncompleteForMonth } from '@/app/actions/pcpndt'
import FormFRegister from './_components/FormFRegister'
import { istToday } from '@/lib/istDate'

/**
 * The Form F register.
 *
 * Behind pcpndt:record rather than radiology:read, deliberately. A nurse who
 * can look up an X-ray has no business reading a woman's reproductive history
 * and the sex of each of her living children.
 */
export default async function PcpndtPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'pcpndt:record')) redirect('/dashboard')

  const month = istToday().slice(0, 7)
  const [rows, incomplete] = await Promise.all([
    listFormF({ month }),
    countIncompleteForMonth(month),
  ])

  return (
    <div>
      <PageHeader
        title="Form F — PC&PNDT register"
        subtitle="Every ultrasound on a pregnant woman. Filed with the Appropriate Authority by the 5th."
      />
      <FormFRegister
        initialRows={rows}
        initialMonth={month}
        initialIncomplete={incomplete}
        canReport={hasPermission(actor.role, 'pcpndt:report')}
      />
    </div>
  )
}
