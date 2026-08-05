import ToolShell from '@/components/marketing/ToolShell'
import { getTool, toolMetadata } from '@/lib/tools/registry'
import BillGenerator from './_components/BillGenerator'

const SLUG = 'hospital-bill-format-generator'
export const metadata = toolMetadata(SLUG)

export default function Page() {
  return (
    <ToolShell meta={getTool(SLUG)!}>
      <BillGenerator />
    </ToolShell>
  )
}
