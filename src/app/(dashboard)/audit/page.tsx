export const dynamic = 'force-dynamic'
import { listAuditLogs, listActors } from '@/app/actions/audit'
import AuditClient from './_components/AuditClient'

export default async function AuditLogPage() {
  const [logs, actors] = await Promise.all([
    listAuditLogs({ limit: 100 }),
    listActors(),
  ])
  return <AuditClient initialLogs={logs} actors={actors} />
}
