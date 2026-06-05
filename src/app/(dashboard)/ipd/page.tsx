import { listAdmissions } from '@/app/actions/ipd'
import { listWards } from '@/app/actions/wards'
import { createClient } from '@/lib/supabase/server'
import IpdClient from './_components/IpdClient'

export default async function IpdPage() {
  const supabase = await createClient()
  const [admissions, wards, doctorsRes] = await Promise.all([
    listAdmissions({ status: 'admitted' }),
    listWards(),
    supabase.from('profiles').select('id, full_name').eq('role', 'doctor').eq('is_active', true),
  ])

  return (
    <IpdClient
      initialAdmissions={admissions}
      wards={wards}
      doctors={(doctorsRes.data ?? []) as { id: string; full_name: string }[]}
    />
  )
}
