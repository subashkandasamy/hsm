export const dynamic = 'force-dynamic'
import { getMyPinStatus } from '@/app/actions/counter'
import PageHeader from '@/components/ui/PageHeader'
import MyPinClient from './_components/MyPinClient'

export default async function MyPinPage() {
  const status = await getMyPinStatus().catch(() => ({ eligible: false, hasPin: false, locked: false }))
  return (
    <div>
      <PageHeader title="Counter PIN" subtitle="Your own 4-digit PIN for switching in on a shared counter computer." />
      <MyPinClient status={status} />
    </div>
  )
}
