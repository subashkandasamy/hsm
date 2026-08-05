import ToolShell from '@/components/marketing/ToolShell'
import { getTool, toolMetadata } from '@/lib/tools/registry'
import GstCalculator from './_components/GstCalculator'

const SLUG = 'gst-on-hospital-bill-calculator'
export const metadata = toolMetadata(SLUG)

export default function Page() {
  return (
    <ToolShell meta={getTool(SLUG)!}>
      <GstCalculator />
    </ToolShell>
  )
}
