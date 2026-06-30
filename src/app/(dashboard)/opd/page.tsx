import { createClient } from '@/lib/supabase/server'
import { getTodaysQueue, getAppointmentsBillStatuses } from '@/app/actions/appointments'
import OpdWorklist from './_components/OpdWorklist'

export default async function OpdPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles').select('id, role').eq('id', user!.id).single()

  const doctorId = profile?.role === 'doctor' ? profile.id : undefined
  const queue = await getTodaysQueue(doctorId)
  const billStatuses = await getAppointmentsBillStatuses(queue.map((a) => a.id))

  return <OpdWorklist initialQueue={queue} doctorId={doctorId} initialBillStatuses={billStatuses} />
}
