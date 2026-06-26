'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { DepartmentSchema } from '@/lib/schemas'

export async function createDepartment(formData: FormData) {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'admin:all')

  const input = DepartmentSchema.parse({
    id: crypto.randomUUID(),
    name: formData.get('name'),
    description: formData.get('description') || null,
  })

  const supabase = await createClient()
  const { error } = await supabase.from('departments').insert({ ...input, tenant_id: actor.tenant_id })
  if (error) throw new Error(error.message)

  await logAudit(actor.id, 'create', 'department', input.id, { name: input.name })
  return { success: true, id: input.id }
}

export async function updateDepartment(
  departmentId: string,
  formData: FormData
) {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'admin:all')

  const updates = {
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('departments')
    .update(updates)
    .eq('id', departmentId)

  if (error) throw new Error(error.message)

  await logAudit(actor.id, 'update', 'department', departmentId, updates)
  return { success: true }
}

export async function toggleProfileActive(profileId: string, isActive: boolean) {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'admin:all')

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', profileId)

  if (error) throw new Error(error.message)

  await logAudit(actor.id, isActive ? 'activate' : 'deactivate', 'profile', profileId)
  return { success: true }
}
