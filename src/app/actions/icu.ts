'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { IcuObservationSchema, FluidBalanceSchema, CriticalCareSchema } from '@/lib/schemas'
import type { IcuObservation, IcuFluidEntry } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Critical-care flags ----

export async function setCriticalCare(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')
  const parsed = CriticalCareSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('admissions').update(parsed.data).eq('id', admissionId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'critical_care', 'admission', admissionId, parsed.data)
  return { success: true }
}

// ---- ICU flow sheet ----

export async function recordIcuObservation(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
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
  const today = new Date().toISOString().split('T')[0]
  let intake = 0, output = 0, todayIntake = 0, todayOutput = 0
  for (const e of entries) {
    const isToday = (e.recorded_at ?? '').startsWith(today)
    if (e.direction === 'intake') { intake += e.volume_ml; if (isToday) todayIntake += e.volume_ml }
    else { output += e.volume_ml; if (isToday) todayOutput += e.volume_ml }
  }
  return { entries, totals: { intake, output, net: intake - output, todayIntake, todayOutput } }
}
