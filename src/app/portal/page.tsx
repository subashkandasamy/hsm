export const dynamic = 'force-dynamic'
import { getPatientMe, getMyHospitals, listMembers } from '@/app/actions/patientPortal'
import PatientAuth from './_components/PatientAuth'
import PatientHome from './_components/PatientHome'

export default async function PortalPage() {
  const me = await getPatientMe()
  if (!me) return <PatientAuth />

  const [members, hospitals] = await Promise.all([listMembers(), getMyHospitals()])
  return <PatientHome members={members} hospitals={hospitals} phone={me.phone} />
}
