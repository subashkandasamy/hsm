import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { getPatient } from '@/app/actions/patients'
import { listAppointments } from '@/app/actions/appointments'
import { getPatientVisits } from '@/app/actions/opd'
import { listBills } from '@/app/actions/billing'
import { listAllergies } from '@/app/actions/allergies'
import { listDocuments } from '@/app/actions/documents'
import { getPatientTimeline, getDiagnosisSummary } from '@/app/actions/emr'
import PatientProfile from './_components/PatientProfile'
import type { Role } from '@/lib/types'

interface Props { params: Promise<{ id: string }> }

export default async function PatientDetailPage({ params }: Props) {
  const { id } = await params

  // Fetch the current user's role for RBAC-aware rendering
  const user = await getCachedUser()
  const supabase = await createClient()
  let role: Role = 'receptionist'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (profile) role = profile.role as Role
  }

  const [patient, visits, appointments, bills, allergies, documents, timeline, diagnoses] = await Promise.all([
    getPatient(id),
    getPatientVisits(id),
    listAppointments({ patientId: id }),
    listBills({ patientId: id }),
    listAllergies(id),
    listDocuments(id),
    getPatientTimeline(id).catch(() => []),
    getDiagnosisSummary(id).catch(() => []),
  ])

  if (!patient) notFound()

  return (
    <PatientProfile
      patient={patient}
      visits={visits}
      appointments={appointments}
      bills={bills}
      allergies={allergies}
      documents={documents}
      timeline={timeline}
      diagnoses={diagnoses}
      role={role}
    />
  )
}
