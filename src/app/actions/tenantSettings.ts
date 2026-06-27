'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { z } from 'zod'

const VALID_MODULES = ['ipd','emergency','bloodbank','ot','lab','radiology','pharmacy','insurance','inventory','hr'] as const
export type ModuleKey = typeof VALID_MODULES[number]

const UpdateModulesSchema = z.object({
  modules: z.array(z.enum(VALID_MODULES)),
})

type SimpleResult = { success: true } | { success: false; error: string }

export async function get2FAEnabled(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()
  if (!profile?.tenant_id) return false

  const service = createServiceClient()
  const { data: tenant } = await service
    .from('tenants')
    .select('sms_2fa_enabled')
    .eq('id', profile.tenant_id)
    .single()

  return tenant?.sms_2fa_enabled ?? false
}

export async function set2FAEnabled(enabled: boolean): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:write')

  const service = createServiceClient()
  const { error } = await service
    .from('tenants')
    .update({ sms_2fa_enabled: enabled })
    .eq('id', actor.tenant_id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'tenant_security', actor.tenant_id, { sms_2fa_enabled: enabled })
  return { success: true }
}

export async function getEnabledModules(): Promise<ModuleKey[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return VALID_MODULES.slice()

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()
  if (!profile?.tenant_id) return VALID_MODULES.slice()

  const service = createServiceClient()
  const { data: tenant } = await service
    .from('tenants')
    .select('enabled_modules')
    .eq('id', profile.tenant_id)
    .single()

  const raw = tenant?.enabled_modules
  if (Array.isArray(raw)) return raw as ModuleKey[]
  return VALID_MODULES.slice()
}

export async function updateEnabledModules(
  input: Record<string, unknown>
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:modules')

  const parsed = UpdateModulesSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const service = createServiceClient()
  const { error } = await service
    .from('tenants')
    .update({ enabled_modules: parsed.data.modules })
    .eq('id', actor.tenant_id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'tenant_modules', actor.tenant_id, {
    enabled_modules: parsed.data.modules,
  })
  return { success: true }
}
