export const dynamic = 'force-dynamic'

import { redirect, notFound } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import PageHeader from '@/components/ui/PageHeader'
import { getMtp, listPcpndtOptions } from '@/app/actions/pcpndt'
import MtpEditor from '../../_components/MtpEditor'

export default async function MtpRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'pcpndt:record')) redirect('/dashboard')

  const { id } = await params
  const [record, grounds] = await Promise.all([getMtp(id), listPcpndtOptions('mtp_ground')])
  if (!record) notFound()

  return (
    <div>
      <PageHeader
        title={`MTP ${record.serial_no as string}`}
        subtitle={record.status === 'draft'
          ? 'The monthly statement to the CMO is built from these records.'
          : 'Complete.'}
      />
      <MtpEditor record={record} grounds={grounds} />
    </div>
  )
}
