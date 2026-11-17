export const dynamic = 'force-dynamic'

import { listExpenses } from '@/app/actions/expenses'
import { actorCan } from '@/lib/server-utils'
import { istToday } from '@/lib/istDate'
import PageHeader from '@/components/ui/PageHeader'
import ExpensesClient from './_components/ExpensesClient'

// Who may open it is decided by the route rules (billing:write, routeAccess.ts).
export default async function ExpensesPage() {
  const [initial, canAdd, canManage] = await Promise.all([
    listExpenses(),
    actorCan('billing:write'),
    // Reports and cancelling: admin and accountant — no grant can give this.
    actorCan('billing:manage'),
  ])
  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Expenses" subtitle="Money paid out — with the bill, or a note of why there is none" />
      <ExpensesClient initial={initial} today={istToday()} canAdd={canAdd} canManage={canManage} />
    </div>
  )
}
