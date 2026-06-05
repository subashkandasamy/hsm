import { notFound } from 'next/navigation'
import { getPatient } from '@/app/actions/patients'
import { listAppointments } from '@/app/actions/appointments'
import { getPatientVisits } from '@/app/actions/opd'
import PatientProfile from './_components/PatientProfile'

interface Props { params: Promise<{ id: string }> }

export default async function PatientDetailPage({ params }: Props) {
  const { id } = await params
  const [patient, visits, appointments] = await Promise.all([
    getPatient(id),
    getPatientVisits(id),
    listAppointments({ patientId: id }),
  ])

  if (!patient) notFound()

  return <PatientProfile patient={patient} visits={visits} appointments={appointments} />
}
