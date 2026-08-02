export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getPatientMe, getPatientHospitalRecords } from '@/app/actions/patientPortal'
import HospitalRecords from './HospitalRecords'

interface Props { params: Promise<{ patientId: string }> }

export default async function HospitalRecordsPage({ params }: Props) {
  const me = await getPatientMe()
  if (!me) redirect('/')

  const { patientId } = await params
  const records = await getPatientHospitalRecords(patientId)
  if (!records) redirect('/') // not logged in, or this record isn't theirs

  return <HospitalRecords records={records} />
}
