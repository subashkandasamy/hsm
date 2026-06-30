'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import type { AdmissionNurseAssignment } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

export async function assignNurse(params: {
  admissionId: string
  nurseId: string
  shift: 'morning' | 'night'
  date: string
}): Promise<{ success: true; assignment: AdmissionNurseAssignment } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')

  const { admissionId, nurseId, shift, date } = params
  const supabase = await createClient()

  // Fetch the nurse's current charge rate (snapshot at assignment time)
  const { data: sp } = await supabase
    .from('staff_profiles')
    .select('nursing_charge_per_shift')
    .eq('profile_id', nurseId)
    .maybeSingle()

  const chargeSnapshot = (sp?.nursing_charge_per_shift as number) ?? 0

  const id = crypto.randomUUID()
  const { error } = await supabase.from('admission_nurse_assignments').insert({
    id,
    tenant_id:       actor.tenant_id,
    admission_id:    admissionId,
    nurse_id:        nurseId,
    shift,
    assigned_date:   date,
    charge_snapshot: chargeSnapshot,
  })

  if (error) {
    if (error.code === '23505')
      return { success: false, error: `A nurse is already assigned to the ${shift} shift on ${date}` }
    return { success: false, error: error.message }
  }

  await logAudit(actor.id, 'assign', 'nurse', id, { admissionId, nurseId, shift, date, chargeSnapshot })

  const { data: row } = await supabase
    .from('admission_nurse_assignments')
    .select('*, nurse:profiles(id, full_name)')
    .eq('id', id)
    .single()

  return { success: true, assignment: row as unknown as AdmissionNurseAssignment }
}

export async function unassignNurse(assignmentId: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')

  const supabase = await createClient()

  // Block unassignment if that day's bill already exists (charge is locked in billing history)
  const { data: assignment } = await supabase
    .from('admission_nurse_assignments')
    .select('assigned_date, admission_id')
    .eq('id', assignmentId)
    .single()

  if (!assignment) return { success: false, error: 'Assignment not found' }

  const { count } = await supabase
    .from('bills')
    .select('id', { count: 'exact', head: true })
    .eq('admission_id', assignment.admission_id)
    .gte('created_at', `${assignment.assigned_date}T00:00:00`)
    .lt('created_at', `${assignment.assigned_date}T23:59:59`)

  if ((count ?? 0) > 0)
    return { success: false, error: 'Cannot unassign — this shift has already been billed' }

  const { error } = await supabase
    .from('admission_nurse_assignments')
    .delete()
    .eq('id', assignmentId)

  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'unassign', 'nurse', assignmentId, {})
  return { success: true }
}

export async function listAssignments(
  admissionId: string,
  dateRange?: { from: string; to: string }
): Promise<AdmissionNurseAssignment[]> {
  const supabase = await createClient()
  let q = supabase
    .from('admission_nurse_assignments')
    .select('*, nurse:profiles(id, full_name)')
    .eq('admission_id', admissionId)
    .order('assigned_date', { ascending: false })
    .order('shift')

  if (dateRange) {
    q = q.gte('assigned_date', dateRange.from).lte('assigned_date', dateRange.to)
  }

  const { data } = await q
  return (data ?? []) as unknown as AdmissionNurseAssignment[]
}

export async function setNursingCharge(
  profileId: string,
  amount: number | null
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:config')

  if (amount !== null && amount < 0)
    return { success: false, error: 'Amount cannot be negative' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('staff_profiles')
    .update({ nursing_charge_per_shift: amount })
    .eq('profile_id', profileId)

  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'nursing_charge', profileId, { amount })
  return { success: true }
}

export async function listNurses(): Promise<Array<{
  id: string
  full_name: string
  nursing_charge_per_shift: number | null
}>> {
  const supabase = await createClient()

  const { data: nurses } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'nurse')
    .eq('is_active', true)
    .order('full_name')

  if (!nurses?.length) return []

  const { data: sp } = await supabase
    .from('staff_profiles')
    .select('profile_id, nursing_charge_per_shift')
    .in('profile_id', nurses.map((n) => n.id as string))

  const rateMap = new Map(
    (sp ?? []).map((r) => [r.profile_id as string, r.nursing_charge_per_shift as number | null])
  )

  return nurses.map((n) => ({
    id: n.id as string,
    full_name: n.full_name as string,
    nursing_charge_per_shift: rateMap.get(n.id as string) ?? null,
  }))
}
