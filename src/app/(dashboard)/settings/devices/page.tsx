export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import PageHeader from '@/components/ui/PageHeader'
import DeviceManager from './_components/DeviceManager'
import {
  listConnectors, listAnalyzers, listModalities, listUnknownCodes,
  listUnmatchedMessages, listAnalytes, getConnectorDownload,
} from '@/app/actions/devices'

export default async function DevicesSettingsPage() {
  const actor = await getActorProfile()

  // Two different jobs live on this page. Answering "what does CRP-HS measure?"
  // and attaching a stranded result are bench work — the technician knows the
  // machine and is holding the tube. Setting a laboratory up with connectors
  // and switching an analyzer live is the owner's. `lab:manage` also gates test
  // pricing, so granting it to a technician to clear a queue would hand them
  // the price list; hence the split rather than one permission for the page.
  const canWorkQueues = hasPermission(actor.role, 'lab:process')
  const canManage = hasPermission(actor.role, 'lab:manage')
  if (!canWorkQueues && !canManage) redirect('/dashboard')

  const [connectors, analyzers, modalities, unknownCodes, unmatched, analytes, release] = await Promise.all([
    listConnectors(),
    listAnalyzers(),
    listModalities(),
    listUnknownCodes(),
    listUnmatchedMessages(),
    listAnalytes(),
    getConnectorDownload(),
  ])

  return (
    <div>
      <PageHeader
        title="Analyzer &amp; scanner connection"
        subtitle={canManage
          ? 'Connect your laboratory analyzers and your scanners, so results and images arrive on their own.'
          : 'Results waiting on you before they can reach a patient.'}
      />
      <DeviceManager
        connectors={connectors}
        analyzers={analyzers}
        modalities={modalities}
        unknownCodes={unknownCodes}
        unmatched={unmatched}
        analytes={analytes}
        canManage={canManage}
        release={release}
      />
    </div>
  )
}
