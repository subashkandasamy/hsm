export const dynamic = 'force-dynamic'

import { redirect, notFound } from 'next/navigation'
import { actorCan } from '@/lib/server-utils'
import PageHeader from '@/components/ui/PageHeader'
import { getMlc, listMlcOptions, listPoliceIntimations } from '@/app/actions/mlc'
import MlcEditor from '../../_components/MlcEditor'

export default async function MlcEntryPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await actorCan('emergency:read'))) redirect('/dashboard')

  const { id } = await params
  const record = await getMlc(id)
  if (!record) notFound()

  const [options, intimations] = await Promise.all([
    listMlcOptions(),
    listPoliceIntimations(id),
  ])

  return (
    <div>
      <PageHeader
        title={`Accident Register ${record.ar_no as string}`}
        subtitle={record.status === 'draft'
          ? 'Fill it while the details are fresh. Nothing here can be reconstructed from memory in six months.'
          : 'Signed and locked. Corrections are made as an amendment, and both versions stay.'}
      />
      <MlcEditor record={record} options={options} intimations={intimations} />
    </div>
  )
}
