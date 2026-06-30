'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import type { ProcedureTariff, Ward } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

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
  category: 'surgery' | 'procedure' | 'package' | 'general' | null
  default_price: number
}): Promise<{ success: true; tariff: ProcedureTariff } | { success: false; error: string }> {
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
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'procedure_tariff', id, { name, default_price })
  const { data } = await supabase.from('procedure_tariffs').select('*').eq('id', id).single()
  return { success: true, tariff: data as ProcedureTariff }
}

export async function updateProcedureTariff(
  id: string,
  input: {
    name?: string
    category?: 'surgery' | 'procedure' | 'package' | 'general' | null
    default_price?: number
    is_active?: boolean
  }
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'tariffs:manage')

  if (input.default_price !== undefined && input.default_price < 0)
    return { success: false, error: 'Price cannot be negative' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('procedure_tariffs')
    .update(input)
    .eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'procedure_tariff', id, input as Record<string, unknown>)
  return { success: true }
}
