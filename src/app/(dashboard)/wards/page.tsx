export const dynamic = 'force-dynamic'
import { getWardBoard, listWards, listWardRoomTypes, listNursingUnits } from '@/app/actions/wards'
import { listAllOtRooms } from '@/app/actions/ot'
import { createClient } from '@/lib/supabase/server'
import WardsClient from './_components/WardsClient'
import { DOCTOR_FILTER } from '@/lib/doctors'

export default async function WardsPage() {
  const supabase = await createClient()
  const [board, wards, otRooms, roomTypes, nursingUnits, deptsRes, doctorsRes] = await Promise.all([
    getWardBoard(),
    listWards(),
    listAllOtRooms(),
    listWardRoomTypes(),
    listNursingUnits(),
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('profiles').select('id, full_name').or(DOCTOR_FILTER).eq('is_active', true),
  ])

  return (
    <WardsClient
      initialBoard={board}
      wards={wards}
      initialOtRooms={otRooms}
      initialRoomTypes={roomTypes}
      initialNursingUnits={nursingUnits}
      departments={(deptsRes.data ?? []) as { id: string; name: string }[]}
      doctors={(doctorsRes.data ?? []) as { id: string; full_name: string }[]}
    />
  )
}
