export const dynamic = 'force-dynamic'
import { listAdmissions } from '@/app/actions/ipd'
import { listWards } from '@/app/actions/wards'
import { generateMissingDailyCharges } from '@/app/actions/billing'
import { getActorProfile } from '@/lib/server-utils'
import { createClient } from '@/lib/supabase/server'
import IpdClient from './_components/IpdClient'
import type { ProcedureTariff } from '@/lib/types'

export default async function IpdPage() {
  const [supabase, actor] = await Promise.all([createClient(), getActorProfile()])
  const [admissions, wards, doctorsRes, tariffsRes, tenantRes, generalRes] = await Promise.all([
    listAdmissions({ status: 'admitted' }),
    listWards(),
    supabase.from('profiles').select('id, full_name').eq('role', 'doctor').eq('is_active', true),
    supabase.from('procedure_tariffs').select('*').eq('is_active', true).neq('category', 'general').order('name'),
    supabase.from('tenants').select('advance_percentage').eq('id', actor.tenant_id).single(),
    supabase.from('procedure_tariffs').select('default_price').eq('category', 'general').eq('is_active', true).limit(1).maybeSingle(),
  ])

  // Generate missing daily room rent + nursing bills for all active admissions.
  // Non-blocking for existing bills (dedup index prevents duplicates).
  await generateMissingDailyCharges(
    admissions.map((a) => ({
      id: a.id,
      patient_id: a.patient_id,
      admitting_doctor_id: (a as unknown as { admitting_doctor_id?: string | null }).admitting_doctor_id ?? null,
      admitted_at: (a as unknown as { admitted_at?: string | null }).admitted_at ?? null,
      ward: (a.ward as unknown as { name: string; daily_rate: number }) ?? { name: '', daily_rate: 0 },
    }))
  )

  return (
    <IpdClient
      initialAdmissions={admissions}
      wards={wards}
      doctors={(doctorsRes.data ?? []) as { id: string; full_name: string }[]}
      procedureTariffs={(tariffsRes.data ?? []) as ProcedureTariff[]}
      generalTariffPrice={(generalRes.data?.default_price as number) ?? undefined}
      advancePercentage={(tenantRes.data?.advance_percentage as number) ?? 50}
    />
  )
}
