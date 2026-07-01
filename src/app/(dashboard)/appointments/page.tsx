import { createClient } from '@/lib/supabase/server'
import { listAppointments } from '@/app/actions/appointments'
import AppointmentsClient from './_components/AppointmentsClient'

export default async function AppointmentsPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const [appts, profilesRes, deptsRes, admissionsRes] = await Promise.all([
    listAppointments({ date: today }),
    supabase.from('profiles').select('id, full_name, role').eq('role', 'doctor').eq('is_active', true),
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('admissions').select('patient_id').eq('status', 'admitted'),
  ])

  const admittedPatientIds = (admissionsRes.data ?? []).map((r) => r.patient_id as string)

  return (
    <AppointmentsClient
      initialAppointments={appts}
      doctors={(profilesRes.data ?? []) as { id: string; full_name: string; role: string }[]}
      departments={(deptsRes.data ?? []) as { id: string; name: string }[]}
      initialDate={today}
      admittedPatientIds={admittedPatientIds}
    />
  )
}
