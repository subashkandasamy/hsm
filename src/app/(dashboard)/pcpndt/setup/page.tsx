export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import PageHeader from '@/components/ui/PageHeader'
import { listScanBuckets, listTrackedDrugs } from '@/app/actions/pcpndt'
import ReturnSetup from '../_components/ReturnSetup'

/**
 * Set up once, so the monthly returns can be generated rather than assembled.
 *
 * Behind pcpndt:report rather than pcpndt:record: a sonologist fills in Form F,
 * but deciding which column a study counts in, and declaring the hospital's
 * opening drug stock, is the owner's call and it affects every month after.
 */
export default async function PcpndtSetupPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'pcpndt:report')) redirect('/pcpndt')

  const [scans, drugs] = await Promise.all([listScanBuckets(), listTrackedDrugs()])

  return (
    <div>
      <PageHeader
        title="Monthly return setup"
        subtitle="Two things the returns cannot work out for themselves."
      />
      <ReturnSetup scans={scans} drugs={drugs} />
    </div>
  )
}
