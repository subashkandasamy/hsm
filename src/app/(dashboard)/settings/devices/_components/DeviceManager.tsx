'use client'

import { useRouter } from 'next/navigation'
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
  connectors, analyzers, unknownCodes, unmatched, analytes,
}: {
  connectors: ConnectorRow[]
  analyzers: AnalyzerRow[]
  unknownCodes: UnknownCode[]
  unmatched: UnmatchedMessage[]
  analytes: AnalyteOption[]
}) {
  const router = useRouter()
  const refresh = () => router.refresh()

  return (
    <div>
      <CodeQueue codes={unknownCodes} analytes={analytes} onChange={refresh} />
      <SampleQueue messages={unmatched} onChange={refresh} />
      <ConnectorSection connectors={connectors} onChange={refresh} />
      <AnalyzerSection analyzers={analyzers} onChange={refresh} />
    </div>
  )
}
