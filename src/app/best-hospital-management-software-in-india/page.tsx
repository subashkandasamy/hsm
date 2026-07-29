import SolutionShell from '@/components/marketing/SolutionShell'
import { getSolution, solutionMetadata } from '@/lib/solutions/registry'

const SLUG = 'best-hospital-management-software-in-india'
export const metadata = solutionMetadata(SLUG)

export default function Page() {
  return <SolutionShell meta={getSolution(SLUG)!} />
}
