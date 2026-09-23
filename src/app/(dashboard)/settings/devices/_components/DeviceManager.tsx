'use client'

import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import ConnectorSection from './ConnectorSection'
import AnalyzerSection from './AnalyzerSection'
import CodeQueue from './CodeQueue'
import SampleQueue from './SampleQueue'
import type {
  ConnectorRow, AnalyzerRow, UnknownCode, UnmatchedMessage, AnalyteOption,
} from '@/app/actions/devices'

/**
 * Everything to do with analyzers, in the order a person needs it.
 *
 * The two queues sit at the top because they are work waiting on somebody —
 * an unrecognised code means measurements are being dropped, and an unmatched
 * sample means a patient's result is sitting in limbo. Neither is something to
 * discover by scrolling.
 *
 * Setup is below them, because it is done once and then never looked at again.
 */
export default function DeviceManager({
  connectors, analyzers, unknownCodes, unmatched, analytes, canManage,
}: {
  connectors: ConnectorRow[]
  analyzers: AnalyzerRow[]
  unknownCodes: UnknownCode[]
  unmatched: UnmatchedMessage[]
  analytes: AnalyteOption[]
  /** Setting the laboratory up is the owner's job; clearing the queues is not. */
  canManage: boolean
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
          <ConnectorSection connectors={connectors} onChange={refresh} />
          <AnalyzerSection analyzers={analyzers} onChange={refresh} />
        </>
      )}
    </div>
  )
}
