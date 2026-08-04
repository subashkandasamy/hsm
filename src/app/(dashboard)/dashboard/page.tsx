export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>
}) {
  const { welcome } = await searchParams
  const user = await getCachedUser()
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user!.id).single()
  const role = (profile?.role as string) ?? 'nurse'

  if (role === 'admin' || role === 'accountant') {
    const kpis = await getAdminDashboard().catch(() => null)
    // Setup guide is an admin responsibility only.
    const setup = role === 'admin' ? await getSetupProgress().catch(() => null) : null
    // First login after signup (magic link adds ?welcome=1): send a brand-new
    // admin straight into the setup guide, unless they've already finished it.
    if (welcome === '1' && setup && !setup.allDone && !setup.dismissed) {
      redirect('/getting-started')
    }
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
