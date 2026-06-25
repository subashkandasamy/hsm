import { notFound } from 'next/navigation'
import { getVisit, getPatientVisits } from '@/app/actions/opd'
import { getPatient } from '@/app/actions/patients'
import { listLabCatalog } from '@/app/actions/lab'
import { listRadiologyCatalog } from '@/app/actions/radiology'
import { listDrugs } from '@/app/actions/pharmacy'
import { listAllergies } from '@/app/actions/allergies'
import ConsultationWorkspace from './_components/ConsultationWorkspace'

interface Props { params: Promise<{ visitId: string }> }

export default async function OpdVisitPage({ params }: Props) {
  const { visitId } = await params

  const visit = await getVisit(visitId)
  if (!visit) notFound()

  const [patient, pastVisits, labCatalog, radiologyCatalog, drugs, allergies] = await Promise.all([
    getPatient(visit.patient_id),
    getPatientVisits(visit.patient_id),
    listLabCatalog(),
    listRadiologyCatalog(),
    listDrugs(),
    listAllergies(visit.patient_id),
  ])

  if (!patient) notFound()

  const history = pastVisits.filter((v) => v.id !== visitId)

  return (
    <ConsultationWorkspace
      visit={visit}
      patient={patient}
      history={history}
      labCatalog={labCatalog}
      radiologyCatalog={radiologyCatalog}
      drugs={drugs}
      allergies={allergies}
    />
  )
}
