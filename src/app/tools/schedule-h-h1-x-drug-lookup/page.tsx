import ToolShell from '@/components/marketing/ToolShell'
import { getTool, toolMetadata } from '@/lib/tools/registry'
import DrugLookup from './_components/DrugLookup'

const SLUG = 'schedule-h-h1-x-drug-lookup'
export const metadata = toolMetadata(SLUG)

export default function Page() {
  return (
    <ToolShell meta={getTool(SLUG)!}>
      <DrugLookup />
    </ToolShell>
  )
}
