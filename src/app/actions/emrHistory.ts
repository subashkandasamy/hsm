'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { PatientHistorySchema, PatientProblemSchema } from '@/lib/schemas'
import type { PatientHistory, PatientProblem, ProblemStatus } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Clinical history (one row per patient) ----

export async function getPatientHistory(patientId: string): Promise<PatientHistory | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('patient_history').select('*').eq('patient_id', patientId).maybeSingle()
  return (data as PatientHistory | null) ?? null
}

export async function upsertPatientHistory(patientId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const parsed = PatientHistorySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('patient_history').upsert({
    patient_id: patientId, tenant_id: actor.tenant_id, ...parsed.data,
    updated_by: actor.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'patient_id' })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'patient_history', patientId)
  return { success: true }
}

// ---- Problem list ----

export async function listPatientProblems(patientId: string): Promise<PatientProblem[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('patient_problems')
    .select('*, noter:profiles!noted_by(id, full_name)')
    .eq('patient_id', patientId)
    .order('status')  // active/chronic before resolved
    .order('noted_at', { ascending: false })
  return (data ?? []) as unknown as PatientProblem[]
}

export async function addProblem(patientId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const parsed = PatientProblemSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('patient_problems').insert({
    tenant_id: actor.tenant_id, patient_id: patientId,
    problem: parsed.data.problem, icd_code: parsed.data.icd_code ?? null,
    status: parsed.data.status, onset_date: parsed.data.onset_date ?? null, noted_by: actor.id,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'add', 'patient_problem', patientId, { problem: parsed.data.problem })
  return { success: true }
}

export async function setProblemStatus(id: string, status: ProblemStatus): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const supabase = await createClient()
  const { error } = await supabase.from('patient_problems')
    .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'status', 'patient_problem', id, { status })
  return { success: true }
}

export async function deleteProblem(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const supabase = await createClient()
  const { error } = await supabase.from('patient_problems').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'delete', 'patient_problem', id)
  return { success: true }
}
