'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { GrowthSchema, ImmunizationRecordSchema } from '@/lib/schemas'
import type { GrowthRecord, ImmunizationStatusItem, ImmunizationState } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Growth ----

export async function listGrowth(patientId: string): Promise<GrowthRecord[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pediatric_growth').select('*').eq('patient_id', patientId).order('recorded_at')
  return (data ?? []) as unknown as GrowthRecord[]
}

export async function recordGrowth(patientId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:vitals')
  const parsed = GrowthSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('pediatric_growth').insert({
    tenant_id: actor.tenant_id, patient_id: patientId, recorded_by: actor.id,
    ...parsed.data, recorded_at: parsed.data.recorded_at || new Date().toISOString().split('T')[0],
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'growth', 'patient', patientId)
  return { success: true }
}

// ---- Immunization ----

// Computed schedule status vs the child's DOB and recorded doses.
export async function getImmunizationStatus(patientId: string): Promise<ImmunizationStatusItem[]> {
  const supabase = await createClient()
  const [{ data: patient }, { data: schedule }, { data: given }] = await Promise.all([
    supabase.from('patients').select('dob').eq('id', patientId).single(),
    supabase.from('immunization_schedule').select('*').order('sort_order'),
    supabase.from('patient_immunizations').select('vaccine, dose_label, given_date').eq('patient_id', patientId),
  ])
  const dob = patient?.dob as string | null
  if (!dob) return []
  const dobMs = new Date(dob).getTime()
  const today = new Date().toISOString().split('T')[0]
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  const givenMap = new Map<string, string>()
  for (const g of given ?? []) givenMap.set(`${g.vaccine}|${g.dose_label}`, g.given_date as string)

  return (schedule ?? []).map((s) => {
    const dueMs = dobMs + (s.due_age_days as number) * 86400000
    const dueDate = new Date(dueMs).toISOString().split('T')[0]
    const givenDate = givenMap.get(`${s.vaccine}|${s.dose_label}`) ?? null
    let status: ImmunizationState
    if (givenDate) status = 'given'
    else if (dueDate < today) status = 'overdue'
    else if (dueDate <= soon) status = 'due'
    else status = 'upcoming'
    return { vaccine: s.vaccine as string, dose_label: s.dose_label as string, due_date: dueDate, given_date: givenDate, status }
  })
}

export async function recordImmunization(patientId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:vitals')
  const parsed = ImmunizationRecordSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('patient_immunizations').insert({
    tenant_id: actor.tenant_id, patient_id: patientId, given_by: actor.id,
    vaccine: parsed.data.vaccine, dose_label: parsed.data.dose_label,
    given_date: parsed.data.given_date || new Date().toISOString().split('T')[0],
    notes: parsed.data.notes ?? null,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'immunization', 'patient', patientId, { vaccine: parsed.data.vaccine, dose: parsed.data.dose_label })
  return { success: true }
}
