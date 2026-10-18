import SolutionShell from '@/components/marketing/SolutionShell'
import { getSolution, solutionMetadata } from '@/lib/solutions/registry'

const SLUG = 'patient-portal-software'
export const metadata = solutionMetadata(SLUG)

export default function Page() {
  return <SolutionShell meta={getSolution(SLUG)!} />
}
