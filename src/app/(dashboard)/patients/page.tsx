import { listPatients } from '@/app/actions/patients'
import PatientsClient from './_components/PatientsClient'

export default async function PatientsPage() {
  const patients = await listPatients()
  return <PatientsClient initialPatients={patients} />
}
