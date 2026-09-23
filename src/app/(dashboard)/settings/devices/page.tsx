export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import PageHeader from '@/components/ui/PageHeader'
import DeviceManager from './_components/DeviceManager'
import {
  listConnectors, listAnalyzers, listUnknownCodes,
  listUnmatchedMessages, listAnalytes,
} from '@/app/actions/devices'

export default async function DevicesSettingsPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'lab:manage')) redirect('/dashboard')

  const [connectors, analyzers, unknownCodes, unmatched, analytes] = await Promise.all([
    listConnectors(),
    listAnalyzers(),
    listUnknownCodes(),
    listUnmatchedMessages(),
    listAnalytes(),
  ])

  return (
    <div>
      <PageHeader
        title="Analyzer connection"
        subtitle="Connect your laboratory machines so results arrive on their own."
      />
      <DeviceManager
        connectors={connectors}
        analyzers={analyzers}
        unknownCodes={unknownCodes}
        unmatched={unmatched}
        analytes={analytes}
      />
    </div>
  )
}
