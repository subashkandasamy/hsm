'use client'

import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import InstallerCard from './InstallerCard'
import ConnectorSection from './ConnectorSection'
import AnalyzerSection from './AnalyzerSection'
import ModalitySection from './ModalitySection'
import CodeQueue from './CodeQueue'
import SampleQueue from './SampleQueue'
import type {
  ConnectorRow, AnalyzerRow, ModalityRow, UnknownCode, UnmatchedMessage, AnalyteOption,
  ConnectorRelease,
} from '@/app/actions/devices'

/**
 * Everything to do with connected machines, in the order a person needs it.
 *
 * Analyzers and scanners are the same kind of thing to a hospital — a device
 * on the network that introduces itself — and they arrive through the same
 * program, so they are managed on one screen rather than two.
 *
 * The two queues sit at the top because they are work waiting on somebody —
 * an unrecognised code means measurements are being dropped, and an unmatched
 * sample means a patient's result is sitting in limbo. Neither is something to
 * discover by scrolling.
 *
 * Setup is below them, because it is done once and then never looked at again.
 */
export default function DeviceManager({
  connectors, analyzers, modalities, unknownCodes, unmatched, analytes, canManage, release,
  internetAvailable, isAdmin,
}: {
  connectors: ConnectorRow[]
  analyzers: AnalyzerRow[]
  modalities: ModalityRow[]
  unknownCodes: UnknownCode[]
  unmatched: UnmatchedMessage[]
  analytes: AnalyteOption[]
  /** Setting the laboratory up is the owner's job; clearing the queues is not. */
  canManage: boolean
  /** The installer to download, or null when none has been published. */
  release: ConnectorRelease | null
  /** This Uyirly server can make Cloudflare Tunnels. */
  internetAvailable: boolean
  isAdmin: boolean
}) {
  const router = useRouter()
  const refresh = () => router.refresh()

  // Both queues render nothing when empty, which for a technician — who sees
  // only the queues — would be a blank page rather than good news.
  const nothingWaiting = !unknownCodes.length && !unmatched.length

  return (
    <div>
      <CodeQueue codes={unknownCodes} analytes={analytes} onChange={refresh} />
      <SampleQueue messages={unmatched} onChange={refresh} />

      {!canManage && nothingWaiting && (
        <GlassCard>
          <EmptyState
            icon={<CheckCircle2 className="w-6 h-6" style={{ color: '#0D9488' }} />}
            title="Nothing waiting"
            description="Every result the analyzers sent has reached a patient. Anything they cannot place will appear here."
          />
        </GlassCard>
      )}

      {canManage && (
        <>
          <InstallerCard release={release} />
          <ConnectorSection connectors={connectors} onChange={refresh}
            latestVersion={release?.version ?? null}
            internetAvailable={internetAvailable} isAdmin={isAdmin} />
          <AnalyzerSection analyzers={analyzers} onChange={refresh} />
          <ModalitySection modalities={modalities} onChange={refresh} />
        </>
      )}
    </div>
  )
}
