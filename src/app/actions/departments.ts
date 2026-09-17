'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { z } from 'zod'
import type { ClinicalTemplate, DepartmentWithTemplate } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

const DepartmentSchema = z.object({
  name:             z.string().min(1, 'Name is required').max(100),
  clinical_template: z.enum(['general', 'dental', 'ophthalmology', 'paediatrics']),
})

export async function listDepartments(): Promise<DepartmentWithTemplate[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('departments')
    .select('id, name, description, clinical_template, created_at')
    .order('name')
  return (data ?? []) as unknown as DepartmentWithTemplate[]
}

export async function createDepartment(
  input: Record<string, unknown>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'departments:manage')

  const parsed = DepartmentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const id = crypto.randomUUID()
  const { error } = await supabase.from('departments').insert({
    id,
    tenant_id:         actor.tenant_id,
    name:              parsed.data.name,
    clinical_template: parsed.data.clinical_template,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'department', id, {
    name: parsed.data.name,
    clinical_template: parsed.data.clinical_template,
  })
  return { success: true, id }
}

export async function updateDepartment(
  id: string,
  input: Record<string, unknown>
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'departments:manage')

  const parsed = DepartmentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('departments')
    .update({ name: parsed.data.name, clinical_template: parsed.data.clinical_template })
    .eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'department', id, {
    name: parsed.data.name,
    clinical_template: parsed.data.clinical_template,
  })
  return { success: true }
}

export async function getDepartmentTemplate(departmentId: string): Promise<ClinicalTemplate> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('departments')
    .select('clinical_template')
    .eq('id', departmentId)
    .single()
  return (data?.clinical_template as ClinicalTemplate | null) ?? 'general'
}
