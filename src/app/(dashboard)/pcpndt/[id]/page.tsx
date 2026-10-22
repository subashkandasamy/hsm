export const dynamic = 'force-dynamic'

import { redirect, notFound } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import PageHeader from '@/components/ui/PageHeader'
import { getFormF, listPcpndtOptions } from '@/app/actions/pcpndt'
import FormFEditor from '../_components/FormFEditor'

export default async function FormFPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'pcpndt:record')) redirect('/dashboard')

  const { id } = await params
  const [record, options] = await Promise.all([getFormF(id), listPcpndtOptions()])
  if (!record) notFound()

  return (
    <div>
      <PageHeader
        title={`Form F ${record.serial_no as string}`}
        subtitle={record.status === 'draft'
          ? 'Every column must hold an answer. Write NA where something does not apply.'
          : 'Complete and locked. Corrections are made as an amendment.'}
      />
      <FormFEditor record={record} options={options} />
    </div>
  )
}
