import { listEmergencyCases } from '@/app/actions/emergency'
import { getWardBoard } from '@/app/actions/wards'
import { createClient } from '@/lib/supabase/server'
import { getActorProfile } from '@/lib/server-utils'
import EmergencyBoard from './_components/EmergencyBoard'
import type { ProcedureTariff } from '@/lib/types'

export default async function EmergencyPage() {
  const [supabase, actor] = await Promise.all([createClient(), getActorProfile()])

  const [cases, board, doctorsRes, tariffsRes, generalRes, tenantRes] = await Promise.all([
    listEmergencyCases(true),
    getWardBoard(),
    supabase.from('profiles').select('id, full_name').eq('role', 'doctor').eq('is_active', true),
    supabase.from('procedure_tariffs').select('*').eq('is_active', true).neq('category', 'general').order('name'),
    supabase.from('procedure_tariffs').select('default_price').eq('category', 'general').eq('is_active', true).limit(1).maybeSingle(),
    supabase.from('tenants').select('advance_percentage').eq('id', actor.tenant_id).single(),
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
      admitTariffs={(tariffsRes.data ?? []) as ProcedureTariff[]}
      admitGeneralTariffPrice={(generalRes.data?.default_price as number) ?? undefined}
      admitAdvancePercentage={(tenantRes.data?.advance_percentage as number) ?? 50}
    />
  )
}
