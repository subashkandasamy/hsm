'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { AncRecordSchema, AncVisitSchema, PartographSchema } from '@/lib/schemas'
import type { AncRecord, AncVisit, PartographObs } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- ANC record (per pregnancy) ----

export async function listAnc(patientId: string): Promise<AncRecord[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('anc_records').select('*').eq('patient_id', patientId).order('created_at', { ascending: false })
  return (data ?? []) as unknown as AncRecord[]
}

export async function createAnc(patientId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const parsed = AncRecordSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  // EDD = LMP + 280 days (Naegele)
  let edd: string | null = null
  if (parsed.data.lmp) edd = new Date(new Date(parsed.data.lmp).getTime() + 280 * 86400000).toISOString().split('T')[0]
  const supabase = await createClient()
  const { error } = await supabase.from('anc_records').insert({
    tenant_id: actor.tenant_id, patient_id: patientId, created_by: actor.id, edd, ...parsed.data,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'create', 'anc_record', patientId)
  return { success: true }
}

export async function setAncStatus(id: string, status: 'active' | 'delivered' | 'closed'): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const supabase = await createClient()
  const { error } = await supabase.from('anc_records').update({ status }).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'status', 'anc_record', id, { status })
  return { success: true }
}

// ---- ANC visits ----

export async function listAncVisits(ancId: string): Promise<AncVisit[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('anc_visits').select('*').eq('anc_id', ancId).order('visit_date', { ascending: false })
  return (data ?? []) as unknown as AncVisit[]
}

export async function addAncVisit(ancId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const parsed = AncVisitSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('anc_visits').insert({
    tenant_id: actor.tenant_id, anc_id: ancId, recorded_by: actor.id,
    ...parsed.data, visit_date: parsed.data.visit_date || new Date().toISOString().split('T')[0],
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'anc_visit', 'anc_record', ancId)
  return { success: true }
}

// ---- Partograph ----

export async function listPartograph(ancId: string): Promise<PartographObs[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('partograph_obs').select('*').eq('anc_id', ancId).order('recorded_at', { ascending: false })
  return (data ?? []) as unknown as PartographObs[]
}

export async function addPartographObs(ancId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const parsed = PartographSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('partograph_obs').insert({
    tenant_id: actor.tenant_id, anc_id: ancId, recorded_by: actor.id, ...parsed.data,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'partograph', 'anc_record', ancId)
  return { success: true }
}
