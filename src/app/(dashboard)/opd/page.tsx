import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { getTodaysQueue, getAppointmentsBillStatuses } from '@/app/actions/appointments'
import OpdWorklist from './_components/OpdWorklist'

export default async function OpdPage() {
  const user = await getCachedUser()
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles').select('id, role').eq('id', user!.id).single()

  const doctorId = profile?.role === 'doctor' ? profile.id : undefined
  const queue = await getTodaysQueue(doctorId)
  const billStatuses = await getAppointmentsBillStatuses(queue.map((a) => a.id))

  return <OpdWorklist initialQueue={queue} doctorId={doctorId} initialBillStatuses={billStatuses} />
}
