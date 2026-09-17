'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import type { ProcedureTariff, Ward } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

/** Plain-language message for the tariff uniqueness rules (migration 0141). */
function tariffSaveError(error: { code?: string; message: string }): string {
  if (error.code === '23505' && error.message.includes('procedure_tariffs_tenant_name_key')) {
    return 'A tariff with this name already exists — edit that one instead.'
  }
  if (error.code === '23505' && error.message.includes('procedure_tariffs_one_active_general')) {
    return 'Only one General tariff can be active — it is the default charge for admissions without a procedure. Disable or edit the current one first.'
  }
  return error.message
}

// ---- Ward room rates ----

export async function listWardsWithRates(): Promise<Ward[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('wards').select('*').order('name')
  return (data ?? []) as Ward[]
}

export async function updateWardRate(wardId: string, dailyRate: number): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'tariffs:manage')
  if (dailyRate < 0) return { success: false, error: 'Rate cannot be negative' }
  const supabase = await createClient()
  const { error } = await supabase.from('wards').update({ daily_rate: dailyRate }).eq('id', wardId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'ward_rate', wardId, { daily_rate: dailyRate })
  return { success: true }
}

// ---- Doctor consultation fee ----

export async function setDoctorConsultationFee(
  profileId: string,
  fee: number | null
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'tariffs:manage')
  if (fee !== null && fee < 0) return { success: false, error: 'Fee cannot be negative' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('staff_profiles')
    .update({ consultation_fee: fee })
    .eq('profile_id', profileId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'consultation_fee', profileId, { fee })
  return { success: true }
}

// ---- Procedure tariffs ----

export async function listProcedureTariffs(): Promise<ProcedureTariff[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('procedure_tariffs')
    .select('*')
    .order('name')
  return (data ?? []) as ProcedureTariff[]
}

export async function createProcedureTariff(input: {
  name: string
  category: 'surgery' | 'procedure' | 'package' | 'general' | 'emergency' | null
  default_price: number
}): Promise<{ success: true; tariff: ProcedureTariff } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'tariffs:manage')

  const { name, category, default_price } = input
  if (!name.trim()) return { success: false, error: 'Name is required' }
  if (default_price < 0) return { success: false, error: 'Price cannot be negative' }

  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('procedure_tariffs').insert({
    id,
    tenant_id: actor.tenant_id,
    name: name.trim(),
    category: category ?? null,
    default_price,
    is_active: true,
  })
  if (error) return { success: false, error: tariffSaveError(error) }

  await logAudit(actor.id, 'create', 'procedure_tariff', id, { name, default_price })
  const { data } = await supabase.from('procedure_tariffs').select('*').eq('id', id).single()
  return { success: true, tariff: data as ProcedureTariff }
}

export async function updateProcedureTariff(
  id: string,
  input: {
    name?: string
    category?: 'surgery' | 'procedure' | 'package' | 'general' | 'emergency' | null
    default_price?: number
    is_active?: boolean
  }
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'tariffs:manage')

  if (input.default_price !== undefined && input.default_price < 0)
    return { success: false, error: 'Price cannot be negative' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('procedure_tariffs')
    .update({ ...input, ...(input.name !== undefined ? { name: input.name.trim() } : {}) })
    .eq('id', id)
  if (error) return { success: false, error: tariffSaveError(error) }

  await logAudit(actor.id, 'update', 'procedure_tariff', id, input as Record<string, unknown>)
  return { success: true }
}

/**
 * Deletes a tariff that was never used. A tariff an admission was charged under
 * is part of that admission's record and can only be disabled.
 */
export async function deleteProcedureTariff(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'tariffs:manage')
  const supabase = await createClient()

  const { data: tariff } = await supabase.from('procedure_tariffs').select('name').eq('id', id).maybeSingle()
  if (!tariff) return { success: false, error: 'Tariff not found' }

  const { count } = await supabase
    .from('admissions').select('id', { count: 'exact', head: true }).eq('procedure_tariff_id', id)
  if ((count ?? 0) > 0) {
    return { success: false, error: `"${tariff.name}" is used by ${count} admission${count === 1 ? '' : 's'} — disable it instead so those records keep their price.` }
  }

  const { error } = await supabase.from('procedure_tariffs').delete().eq('id', id)
  if (error) {
    return { success: false, error: error.code === '23503' ? `"${tariff.name}" is in use — disable it instead.` : error.message }
  }
  await logAudit(actor.id, 'delete', 'procedure_tariff', id, { name: tariff.name })
  return { success: true }
}
