import { listEmergencyCases } from '@/app/actions/emergency'
import { getWardBoard } from '@/app/actions/wards'
import { createClient } from '@/lib/supabase/server'
import EmergencyBoard from './_components/EmergencyBoard'

export default async function EmergencyPage() {
  const supabase = await createClient()
  const [cases, board, doctorsRes] = await Promise.all([
    listEmergencyCases(true),
    getWardBoard(),
    supabase.from('profiles').select('id, full_name').eq('role', 'doctor').eq('is_active', true),
  ])

  const wardOptions = board.map(w => ({
    id: w.id,
    name: w.name,
    availableBeds: w.beds.filter(b => b.status === 'available'),
  }))

  return (
    <EmergencyBoard
      initialCases={cases}
      wardOptions={wardOptions}
      doctors={(doctorsRes.data ?? []) as { id: string; full_name: string }[]}
    />
  )
}
