export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import { getPatient } from '@/app/actions/patients'
import { listEncountersForPatient, listPolicies } from '@/app/actions/insurance'
import InsurancePatientClient from './_components/InsurancePatientClient'

interface Props { params: Promise<{ patientId: string }> }

export default async function InsurancePatientPage({ params }: Props) {
  const { patientId } = await params
  const [patient, encounters, policies] = await Promise.all([
    getPatient(patientId),
    listEncountersForPatient(patientId),
    listPolicies(patientId),
  ])
  if (!patient) notFound()

  return <InsurancePatientClient patient={patient} initialEncounters={encounters} initialPolicies={policies} />
}
