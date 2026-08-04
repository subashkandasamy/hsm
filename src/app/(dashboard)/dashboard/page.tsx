export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import {
  getAdminDashboard, getDoctorDashboard,
  getReceptionistDashboard, getPharmacistDashboard,
} from '@/app/actions/dashboard'
import AdminDashboard from './_components/AdminDashboard'
import DoctorDashboard from './_components/DoctorDashboard'
import ReceptionistDashboard from './_components/ReceptionistDashboard'
import PharmacistDashboard from './_components/PharmacistDashboard'
import GenericDashboard from './_components/GenericDashboard'
import SetupProgressCard from './_components/SetupProgressCard'
import { getSetupProgress } from '@/app/actions/setup'

export default async function DashboardPage() {
  const user = await getCachedUser()
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user!.id).single()
  const role = (profile?.role as string) ?? 'nurse'

  if (role === 'admin' || role === 'accountant') {
    const kpis = await getAdminDashboard().catch(() => null)
    // Setup guide is an admin responsibility only.
    const setup = role === 'admin' ? await getSetupProgress().catch(() => null) : null
    return (
      <>
        {setup && <SetupProgressCard progress={setup} />}
        <AdminDashboard kpis={kpis} />
      </>
    )
  }
  if (role === 'doctor') {
    const kpis = await getDoctorDashboard().catch(() => null)
    return <DoctorDashboard kpis={kpis} />
  }
  if (role === 'receptionist') {
    const kpis = await getReceptionistDashboard().catch(() => null)
    return <ReceptionistDashboard kpis={kpis} />
  }
  if (role === 'pharmacist') {
    const kpis = await getPharmacistDashboard().catch(() => null)
    return <PharmacistDashboard kpis={kpis} />
  }
  return <GenericDashboard role={role} />
}
