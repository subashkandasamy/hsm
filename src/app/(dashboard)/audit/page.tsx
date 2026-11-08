export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { getActivity, listActors } from '@/app/actions/audit'
import { istToday } from '@/lib/istDate'
import AuditClient from './_components/AuditClient'

export default async function ActivityLogPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'audit:read')) redirect('/dashboard')
  const today = istToday()
  const [report, actors] = await Promise.all([getActivity({ from: today, to: today }), listActors()])
  return <AuditClient initialReport={report} initialDate={today} actors={actors} />
}
