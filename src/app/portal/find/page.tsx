export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getPatientMe, listDirectoryHospitals } from '@/app/actions/patientPortal'
import FindHospitals from './FindHospitals'

export default async function FindPage() {
  const me = await getPatientMe()
  if (!me) redirect('/')
  const initial = await listDirectoryHospitals()
  return <FindHospitals initial={initial} />
}
