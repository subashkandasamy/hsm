import { getWardBoard, listWards } from '@/app/actions/wards'
import { listAdmissions } from '@/app/actions/ipd'
import { createClient } from '@/lib/supabase/server'
import WardsClient from './_components/WardsClient'

export default async function WardsPage() {
  const supabase = await createClient()
  const [board, wards, deptsRes, doctorsRes] = await Promise.all([
    getWardBoard(),
    listWards(),
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('profiles').select('id, full_name').eq('role', 'doctor').eq('is_active', true),
  ])

  return (
    <WardsClient
      initialBoard={board}
      wards={wards}
      departments={(deptsRes.data ?? []) as { id: string; name: string }[]}
      doctors={(doctorsRes.data ?? []) as { id: string; full_name: string }[]}
    />
  )
}
