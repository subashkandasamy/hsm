import { createClient } from '@/lib/supabase/server'
import { getTodaysQueue } from '@/app/actions/appointments'
import OpdWorklist from './_components/OpdWorklist'

export default async function OpdPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // If doctor, show only their queue; admin sees all
  const { data: profile } = await supabase
    .from('profiles').select('id, role').eq('id', user!.id).single()

  const doctorId = profile?.role === 'doctor' ? profile.id : undefined
  const queue = await getTodaysQueue(doctorId)

  return <OpdWorklist initialQueue={queue} doctorId={doctorId} />
}
