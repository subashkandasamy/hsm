import ToolShell from '@/components/marketing/ToolShell'
import { getTool, toolMetadata } from '@/lib/tools/registry'
import RatioCalculator from './_components/RatioCalculator'

const SLUG = 'nurse-patient-ratio-calculator'
export const metadata = toolMetadata(SLUG)

export default function Page() {
  return (
    <ToolShell meta={getTool(SLUG)!}>
      <RatioCalculator />
    </ToolShell>
  )
}
