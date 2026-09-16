'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess, requireModule } from '@/lib/server-utils'
import { IcuObservationSchema, FluidBalanceSchema, CriticalCareSchema } from '@/lib/schemas'
import { computeNews, type NewsBand } from '@/lib/earlyWarning'
import { enterIcu, exitIcu, bedIsIcu } from '@/lib/icuStay'
import type { IcuObservation, IcuFluidEntry } from '@/lib/types'
import { istToday, istDate } from '@/lib/istDate'

type SimpleResult = { success: true } | { success: false; error: string }

export interface DeterioratingPatient {
  admission_id: string; patient_name: string; uhid: string
  score: number; band: NewsBand; recorded_at: string
}

// Admitted critical-care patients whose latest NEWS is elevated — a
// deterioration worklist for nursing/doctors.
export async function getDeterioratingPatients(): Promise<DeterioratingPatient[]> {
  const supabase = await createClient()
  const { data: adms } = await supabase
    .from('admissions')
    .select('id, on_ventilator, patient:patients(full_name, uhid)')
    .eq('status', 'admitted')
    .eq('is_critical_care', true)
  const admList = adms ?? []
  if (!admList.length) return []
  const ids = admList.map((a) => a.id as string)

  const { data: obs } = await supabase
    .from('icu_observations')
    .select('admission_id, recorded_at, hr, sbp, spo2, rr, temp, gcs_total, fio2')
    .in('admission_id', ids)
    .order('recorded_at', { ascending: false })

  const latest = new Map<string, NonNullable<typeof obs>[number]>()
  for (const o of obs ?? []) {
    const aid = o.admission_id as string
    if (!latest.has(aid)) latest.set(aid, o)
  }

  const out: DeterioratingPatient[] = []
  for (const a of admList) {
    const o = latest.get(a.id as string)
    if (!o) continue
    const news = computeNews({
      rr: o.rr, spo2: o.spo2, sbp: o.sbp, hr: o.hr, temp: o.temp, gcs_total: o.gcs_total,
      on_oxygen: (o.fio2 != null && o.fio2 > 21) || !!a.on_ventilator,
    })
    if (news.band === 'medium' || news.band === 'high') {
      const p = a.patient as unknown as { full_name?: string; uhid?: string } | null
      out.push({
        admission_id: a.id as string, patient_name: p?.full_name ?? '—', uhid: p?.uhid ?? '',
        score: news.score, band: news.band, recorded_at: o.recorded_at as string,
      })
    }
  }
  // Highest score first
  return out.sort((x, y) => y.score - x.score)
}

// True if the admission's current bed is an ICU bed (for the off-ICU warning).
export async function admissionBedIsIcu(admissionId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: adm } = await supabase.from('admissions').select('bed_id').eq('id', admissionId).maybeSingle()
  return bedIsIcu(supabase, (adm?.bed_id as string | null) ?? null)
}

// ---- Critical-care flags ----

export async function setCriticalCare(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')
  const parsed = CriticalCareSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()

  // is_critical_care transitions go through the ICU-episode helpers (open/close
  // an icu_stay), so manual toggling stays consistent with bed-driven entry.
  if (d.is_critical_care !== undefined) {
    const { data: adm } = await supabase
      .from('admissions').select('is_critical_care, bed_id, ward_id').eq('id', admissionId).single()
    if (d.is_critical_care === true && !adm?.is_critical_care) {
      await enterIcu(supabase, actor.tenant_id, admissionId, (adm?.bed_id as string | null) ?? null, (adm?.ward_id as string | null) ?? null, actor.id)
    } else if (d.is_critical_care === false && adm?.is_critical_care) {
      await exitIcu(supabase, admissionId, actor.id)
    }
  }
  // Remaining flags (never is_critical_care here — handled above)
  const rest: Record<string, unknown> = {}
  if (d.on_ventilator !== undefined) rest.on_ventilator = d.on_ventilator
  if (d.code_status !== undefined) rest.code_status = d.code_status ?? null
  if (d.isolation !== undefined) rest.isolation = d.isolation ?? null
  if (Object.keys(rest).length) {
    const { error } = await supabase.from('admissions').update(rest).eq('id', admissionId)
    if (error) return { success: false, error: error.message }
  }
  await logAudit(actor.id, 'critical_care', 'admission', admissionId, d)
  return { success: true }
}

// ---- ICU flow sheet ----

export async function recordIcuObservation(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')
  const parsed = IcuObservationSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  // Auto GCS total when components given
  const gcsTotal = d.gcs_total ?? (
    d.gcs_e != null && d.gcs_v != null && d.gcs_m != null ? d.gcs_e + d.gcs_v + d.gcs_m : null
  )
  const supabase = await createClient()
  const { error } = await supabase.from('icu_observations').insert({
    tenant_id: actor.tenant_id, admission_id: admissionId, recorded_by: actor.id,
    ...d, gcs_total: gcsTotal,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'icu_observation', 'admission', admissionId)
  return { success: true }
}

export async function listIcuObservations(admissionId: string, limit = 48): Promise<IcuObservation[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('icu_observations')
    .select('*, recorder:profiles!recorded_by(id, full_name)')
    .eq('admission_id', admissionId)
    .order('recorded_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as unknown as IcuObservation[]
}

// ---- Fluid balance (intake / output) ----

export async function recordFluidBalance(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')
  const parsed = FluidBalanceSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('icu_fluid_balance').insert({
    tenant_id: actor.tenant_id, admission_id: admissionId, recorded_by: actor.id, ...parsed.data,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'fluid_balance', 'admission', admissionId, { direction: parsed.data.direction, volume_ml: parsed.data.volume_ml })
  return { success: true }
}

export async function listFluidBalance(admissionId: string): Promise<{
  entries: IcuFluidEntry[]; totals: { intake: number; output: number; net: number; todayIntake: number; todayOutput: number }
}> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('icu_fluid_balance')
    .select('*')
    .eq('admission_id', admissionId)
    .order('recorded_at', { ascending: false })
    .limit(200)
  const entries = (data ?? []) as unknown as IcuFluidEntry[]
  const today = istToday()
  let intake = 0, output = 0, todayIntake = 0, todayOutput = 0
  for (const e of entries) {
    const isToday = !!e.recorded_at && istDate(e.recorded_at) === today
    if (e.direction === 'intake') { intake += e.volume_ml; if (isToday) todayIntake += e.volume_ml }
    else { output += e.volume_ml; if (isToday) todayOutput += e.volume_ml }
  }
  return { entries, totals: { intake, output, net: intake - output, todayIntake, todayOutput } }
}
