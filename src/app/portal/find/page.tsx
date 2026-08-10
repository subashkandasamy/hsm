export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getPatientMe, listDirectoryHospitals, listMembers } from '@/app/actions/patientPortal'
import FindHospitals from './FindHospitals'

export default async function FindPage({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const me = await getPatientMe()
  if (!me) redirect('/')
  const { member } = await searchParams

  const members = await listMembers()
  const selected = members.find((m) => m.id === member) ?? members[0]
  if (!selected) redirect('/')

  const initial = await listDirectoryHospitals(selected.id)
  return <FindHospitals initial={initial} memberId={selected.id} memberName={selected.full_name} />
}
