'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { CarePlanSchema, HandoverSchema } from '@/lib/schemas'
import type { NursingCarePlan, NursingHandover, CarePlanStatus } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Care plans ----

export async function listCarePlans(admissionId: string): Promise<NursingCarePlan[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('nursing_care_plans').select('*').eq('admission_id', admissionId).order('status').order('created_at', { ascending: false })
  return (data ?? []) as unknown as NursingCarePlan[]
}

export async function addCarePlan(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')
  const parsed = CarePlanSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('nursing_care_plans').insert({
    tenant_id: actor.tenant_id, admission_id: admissionId, created_by: actor.id,
    problem: parsed.data.problem, goal: parsed.data.goal ?? null, interventions: parsed.data.interventions ?? null, status: parsed.data.status,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'add', 'care_plan', admissionId)
  return { success: true }
}

export async function setCarePlanStatus(id: string, status: CarePlanStatus): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')
  const supabase = await createClient()
  const { error } = await supabase.from('nursing_care_plans').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'status', 'care_plan', id, { status })
  return { success: true }
}

// ---- SBAR handover ----

export async function listHandovers(admissionId: string): Promise<NursingHandover[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('nursing_handovers').select('*, author:profiles!author_id(id, full_name)')
    .eq('admission_id', admissionId).order('created_at', { ascending: false }).limit(30)
  return (data ?? []) as unknown as NursingHandover[]
}

export async function addHandover(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')
  const parsed = HandoverSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('nursing_handovers').insert({
    tenant_id: actor.tenant_id, admission_id: admissionId, author_id: actor.id, ...parsed.data,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'handover', 'admission', admissionId)
  return { success: true }
}
