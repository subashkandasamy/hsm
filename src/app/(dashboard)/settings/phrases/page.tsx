export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { listAllNoteTemplates } from '@/app/actions/noteTemplates'
import PageHeader from '@/components/ui/PageHeader'
import PhraseManager from './_components/PhraseManager'

export default async function PhrasesSettingsPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'opd:write')) redirect('/dashboard')

  const phrases = await listAllNoteTemplates()

  return (
    <div>
      <PageHeader
        title="Note Phrases"
        subtitle="The phrases your doctors reuse in notes. Everyone here shares one library."
      />
      <PhraseManager initial={phrases} />
    </div>
  )
}
