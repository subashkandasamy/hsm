export const dynamic = 'force-dynamic'

import { getMyReferralOverview } from '@/app/actions/referrals'
import ReferralsClient from './_components/ReferralsClient'

export const metadata = { title: 'Refer & Earn — Uyirly' }

export default async function ReferralsPage() {
  const overview = await getMyReferralOverview()
  return <ReferralsClient overview={overview} />
}
