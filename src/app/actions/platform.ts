'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { TenantWithStats } from '@/lib/types'

async function requirePlatformAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')

  const { data } = await supabase
    .from('platform_admins')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!data) throw new Error('FORBIDDEN: not a platform admin')
  return user
}

export async function listTenants(params?: { status?: string }): Promise<TenantWithStats[]> {
  await requirePlatformAdmin()

  const service = createServiceClient()
  let q = service.from('tenants').select('*').order('created_at', { ascending: false })
  if (params?.status) q = q.eq('status', params.status)
  const { data: tenants } = await q

  if (!tenants) return []

  // Fetch lightweight stats in parallel
  const stats = await Promise.all(
    tenants.map(async (t) => {
      const [userRes, patientRes] = await Promise.all([
        service.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
        service.from('patients').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
      ])
      return {
        ...t,
        user_count:    userRes.count ?? 0,
        patient_count: patientRes.count ?? 0,
        last_activity: null as string | null,
      }
    })
  )

  return stats as TenantWithStats[]
}

export async function suspendTenant(
  tenantId: string, reason: string
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()

  const { error } = await service
    .from('tenants')
    .update({ status: 'suspended' })
    .eq('id', tenantId)

  if (error) return { success: false, error: error.message }

  await service.from('audit_logs').insert({
    id: crypto.randomUUID(),
    actor_id: actor.id,
    action: 'suspend',
    entity: 'tenant',
    entity_id: tenantId,
    meta: { reason },
    tenant_id: tenantId,
  })
  return { success: true }
}

export async function reactivateTenant(
  tenantId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()

  const { data: tenant } = await service
    .from('tenants').select('status').eq('id', tenantId).single()

  // Restore the appropriate status: if it has a subscription, use 'active'; else 'trial'
  const { data: sub } = await service
    .from('subscriptions').select('status').eq('tenant_id', tenantId).maybeSingle()

  const newStatus = sub?.status === 'active' ? 'active' : 'trial'

  const { error } = await service
    .from('tenants').update({ status: newStatus }).eq('id', tenantId)

  if (error) return { success: false, error: error.message }

  await service.from('audit_logs').insert({
    id: crypto.randomUUID(),
    actor_id: actor.id,
    action: 'reactivate',
    entity: 'tenant',
    entity_id: tenantId,
    meta: { previous_status: tenant?.status, new_status: newStatus },
    tenant_id: tenantId,
  })
  return { success: true }
}

// Sets override_access_until so the tenant gets full access until that date,
// regardless of their subscription or trial status.
// Pass null to clear the override (return to normal enforcement).
export async function setTenantAccessOverride(
  tenantId: string,
  until: string | null
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()

  const { error } = await service
    .from('tenants')
    .update({ override_access_until: until })
    .eq('id', tenantId)

  if (error) return { success: false, error: error.message }

  await service.from('audit_logs').insert({
    id: crypto.randomUUID(),
    actor_id: actor.id,
    action: 'access_override',
    entity: 'tenant',
    entity_id: tenantId,
    meta: { override_access_until: until },
    tenant_id: tenantId,
  })
  return { success: true }
}

export interface ImpersonateResult {
  success: true; targetUrl: string; adminEmail: string
}

// Impersonation: log the event and return the tenant URL.
// For full session impersonation, a future increment can use
// supabase.auth.admin.generateLink({ type: 'magiclink' }) to issue a one-time link.
export async function impersonateTenant(
  tenantId: string
): Promise<ImpersonateResult | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()

  const { data: tenant } = await service
    .from('tenants').select('slug, name').eq('id', tenantId).single()
  if (!tenant) return { success: false, error: 'Tenant not found' }

  // Find the tenant's first active admin
  const { data: admin } = await service
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!admin) return { success: false, error: 'No active admin found for this tenant' }

  // Get auth user email for the admin
  const { data: authUser } = await service.auth.admin.getUserById(admin.id)
  const adminEmail = authUser.user?.email ?? 'unknown'

  // Log every impersonation event
  await service.from('audit_logs').insert({
    id: crypto.randomUUID(),
    actor_id: actor.id,
    action: 'impersonate',
    entity: 'tenant',
    entity_id: tenantId,
    meta: { platform_admin: actor.id, target_tenant: tenant.slug, target_admin_email: adminEmail },
    tenant_id: tenantId,
  })

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'
  const targetUrl = `https://${tenant.slug}.${rootDomain}/login?impersonated_by=${actor.id}`

  return { success: true, targetUrl, adminEmail }
}
