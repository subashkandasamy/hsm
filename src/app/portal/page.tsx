export const dynamic = 'force-dynamic'
import { getPatientMe, getMyHospitals } from '@/app/actions/patientPortal'
import PatientAuth from './_components/PatientAuth'
import PatientHome from './_components/PatientHome'

export default async function PortalPage() {
  const me = await getPatientMe()
  if (!me) return <PatientAuth />

  const hospitals = await getMyHospitals()
  return <PatientHome hospitals={hospitals} phone={me.phone} />
}
