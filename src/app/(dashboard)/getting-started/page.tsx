export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { getSetupProgress } from '@/app/actions/setup'
import GettingStarted from './_components/GettingStarted'

export default async function GettingStartedPage() {
  const actor = await getActorProfile()
  if (actor.role !== 'admin') redirect('/dashboard')

  const progress = await getSetupProgress()
  return <GettingStarted progress={progress} />
}
