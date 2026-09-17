export const dynamic = 'force-dynamic'
import { listEmergencyCases, listRecentEmergencyCases } from '@/app/actions/emergency'
import { getWardBoard } from '@/app/actions/wards'
import { createClient } from '@/lib/supabase/server'
import { getActorProfile } from '@/lib/server-utils'
import EmergencyBoard from './_components/EmergencyBoard'
import type { ProcedureTariff } from '@/lib/types'
import { DOCTOR_FILTER } from '@/lib/doctors'

export default async function EmergencyPage() {
  const [supabase, actor] = await Promise.all([createClient(), getActorProfile()])

  const [cases, recent, erTariffsRes, board, doctorsRes, tariffsRes, generalRes, tenantRes] = await Promise.all([
    listEmergencyCases(true),
    listRecentEmergencyCases(7),
    supabase.from('procedure_tariffs').select('*').eq('is_active', true).eq('category', 'emergency').order('name'),
    getWardBoard(),
    supabase.from('profiles').select('id, full_name').or(DOCTOR_FILTER).eq('is_active', true),
    supabase.from('procedure_tariffs').select('*').eq('is_active', true).not('category', 'in', '(general,emergency)').order('name'),
    supabase.from('procedure_tariffs').select('default_price').eq('category', 'general').eq('is_active', true).limit(1).maybeSingle(),
    supabase.from('tenants').select('advance_percentage').eq('id', actor.tenant_id).single(),
  ])

  const wardOptions = board.map(w => ({
    id: w.id,
    name: w.name,
    is_temp: w.is_temp,
    is_multi_bed: w.room_type_data?.is_multi_bed ?? false,
    room_type_id: w.room_type_data?.id ?? null,
    room_type_name: w.room_type_data?.name ?? null,
    availableBeds: w.beds.filter(b => b.status === 'available'),
  }))

  return (
    <EmergencyBoard
      initialCases={cases}
      initialRecent={recent}
      erTariffs={(erTariffsRes.data ?? []) as ProcedureTariff[]}
      wardOptions={wardOptions}
      doctors={(doctorsRes.data ?? []) as { id: string; full_name: string }[]}
      admitTariffs={(tariffsRes.data ?? []) as ProcedureTariff[]}
      admitGeneralTariffPrice={(generalRes.data?.default_price as number) ?? undefined}
      admitAdvancePercentage={(tenantRes.data?.advance_percentage as number) ?? 50}
    />
  )
}
