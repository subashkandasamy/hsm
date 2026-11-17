export const dynamic = 'force-dynamic'
import { listAdmissions, listAdmissionsPage, type AdmissionFilter } from '@/app/actions/ipd'
import { listWards } from '@/app/actions/wards'
import { generateMissingDailyCharges } from '@/app/actions/billing'
import { listDeclarationsForAdmissions } from '@/app/actions/ipdDeclaration'
import { getActorProfile } from '@/lib/server-utils'
import { createClient } from '@/lib/supabase/server'
import IpdClient from './_components/IpdClient'
import type { ProcedureTariff } from '@/lib/types'
import { DOCTOR_FILTER } from '@/lib/doctors'

interface Props { searchParams: Promise<{ status?: string; q?: string; page?: string; size?: string }> }

export default async function IpdPage({ searchParams }: Props) {
  const sp = await searchParams
  const status: AdmissionFilter = sp.status === 'discharged' || sp.status === 'all' ? sp.status : 'admitted'
  const [supabase, actor] = await Promise.all([createClient(), getActorProfile()])
  const [admitted, first, wards, doctorsRes, tariffsRes, tenantRes, generalRes] = await Promise.all([
    // Every open stay, for the daily-charge catch-up below — not just the page on screen.
    listAdmissions({ status: 'admitted' }),
    listAdmissionsPage({ status, q: sp.q, page: Number(sp.page) || 1, size: Number(sp.size) || undefined }),
    listWards(),
    supabase.from('profiles').select('id, full_name').or(DOCTOR_FILTER).eq('is_active', true),
    supabase.from('procedure_tariffs').select('*').eq('is_active', true).not('category', 'in', '(general,emergency)').order('name'),
    supabase.from('tenants').select('advance_percentage').eq('id', actor.tenant_id).single(),
    supabase.from('procedure_tariffs').select('default_price').eq('category', 'general').eq('is_active', true).limit(1).maybeSingle(),
  ])

  // Generate missing daily room rent + nursing bills for all active admissions.
  // Non-blocking for existing bills (dedup index prevents duplicates). The list
  // shows no bills, so its declarations are fetched at the same time.
  const [, declarations] = await Promise.all([
    generateMissingDailyCharges(
      admitted.map((a) => ({
        id: a.id,
        patient_id: a.patient_id,
        admitting_doctor_id: (a as unknown as { admitting_doctor_id?: string | null }).admitting_doctor_id ?? null,
        admitted_at: (a as unknown as { admitted_at?: string | null }).admitted_at ?? null,
        ward: (a.ward as unknown as { name: string; daily_rate: number; room_type?: { is_icu: boolean | null } | null }) ?? { name: '', daily_rate: 0 },
      }))
    ),
    listDeclarationsForAdmissions(first.rows.map((a) => a.id)),
  ])

  return (
    <IpdClient
      initial={first}
      initialStatus={status}
      initialQuery={sp.q ?? ''}
      initialDeclarations={declarations}
      wards={wards}
      doctors={(doctorsRes.data ?? []) as { id: string; full_name: string }[]}
      procedureTariffs={(tariffsRes.data ?? []) as ProcedureTariff[]}
      generalTariffPrice={(generalRes.data?.default_price as number) ?? undefined}
      advancePercentage={(tenantRes.data?.advance_percentage as number) ?? 50}
    />
  )
}
